import { audio } from '../audio/audioEngine';
import { speak } from '../audio/tts';
import { store } from '../app/store';
import { streamChat, type ChatTurn } from './api';
import { recallMemories } from './memory';
import { buildChatTurns, turnsForReroll } from './promptBuilder';
import { demoReply } from './demo';
import { autoBranchSnapshot } from './branchActions';
import { playFixedVoice, stopFixedVoice } from './voicePack';
import { TagStreamParser } from './tagParser';
import { stage } from '../ui/stage';
import { dialogueBox } from '../ui/dialogueBox';
import { setBusy, toast } from '../ui/modal';
import type { ChatMessage, StreamTag } from '../types';

export interface EngineEvents {
  onBusyChange?: (busy: boolean) => void;
  onReplyDone?: (message: ChatMessage) => void;
}

class DialogueEngine {
  busy = false;
  private demoHintShown = false;
  private controller: AbortController | null = null;
  private events: EngineEvents = {};

  setEvents(events: EngineEvents): void {
    this.events = events;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.events.onBusyChange?.(busy);
  }

  private recallQuery(extra: string): string {
    const character = store.character;
    const recent = character.messages
      .slice(-4)
      .map((m) => m.content)
      .join('\n');
    return `${recent}\n${extra}`.slice(-1200);
  }

  private buildTurns(extraUser: string, queryText = extraUser): ChatTurn[] {
    const character = store.character;
    const recalled = recallMemories(character.memories, this.recallQuery(queryText), store.settings.memory.recallTop);
    return buildChatTurns({ character, memories: recalled }, extraUser);
  }

  private async applyTag(tag: StreamTag): Promise<void> {
    const character = store.character;
    switch (tag.type) {
      case 'sprite': {
        const target = tag.value.trim();
        const slot =
          character.sprites.find((s) => s.name === target) ??
          character.sprites.find((s) => s.name.includes(target) || target.includes(s.name));
        if (!slot) return;
        character.currentSpriteId = slot.id;
        store.updateCharacter(() => undefined);
        await stage.showSprite(slot);
        return;
      }
      case 'scene': {
        const target = tag.value.trim();
        const scene =
          character.scenes.find((s) => s.name === target) ??
          character.scenes.find((s) => s.name.includes(target) || target.includes(s.name));
        if (!scene) return;
        character.currentSceneId = scene.id;
        store.updateCharacter(() => undefined);
        await stage.showScene(scene);
        return;
      }
      case 'fx': {
        const kind = tag.value.toLowerCase();
        if (kind.includes('zoom')) stage.playFx('zoom');
        else if (kind.includes('shake')) stage.playFx('shake');
        else if (kind.includes('blush')) stage.playFx('blush');
        return;
      }
      case 'mem': {
        const text = tag.value.trim();
        if (text.length < 2) return;
        store.addMemory(text, { source: 'auto', kind: 'fact' });
        audio.chime('memory');
        toast('Ta 记住了这件事：' + text.slice(0, 26) + (text.length > 26 ? '…' : ''), 'memory');
        return;
      }
      default:
        return;
    }
  }

  private async speakReply(text: string): Promise<void> {
    if (!store.settings.tts.autoRead || store.settings.tts.mode === 'off') return;
    stopFixedVoice();
    try {
      await speak(text, store.settings.tts);
    } catch (err) {
      const hint = (err as { hint?: string }).hint;
      toast(hint ?? (err instanceof Error ? err.message : '朗读失败'), 'error', 5200);
    }
  }

  private async demoStream(text: string, onDelta: (chunk: string) => void): Promise<string> {
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i += 2) {
      onDelta(chars.slice(i, i + 2).join(''));
      await new Promise((r) => setTimeout(r, 26));
    }
    return text;
  }

  private async generate(turns: ChatTurn[], options: { appendUser?: ChatMessage; isReroll?: boolean } = {}): Promise<ChatMessage | null> {
    const character = store.character;
    stopFixedVoice();
    this.controller?.abort();
    this.controller = new AbortController();
    this.setBusy(true);
    dialogueBox.showContinue(false);
    dialogueBox.setSpeaker(character.name, character.title);
    dialogueBox.play('');
    const parser = new TagStreamParser();
    let display = '';
    let streamError: unknown = null;
    const cues: { sprite?: string; scene?: string } = {};

    try {
      const consume = (delta: string): void => {
        const parsed = parser.feed(delta);
        if (parsed.text) {
          display += parsed.text;
          dialogueBox.append(parsed.text);
        }
        for (const tag of parsed.tags) {
          if (tag.type === 'sprite') cues.sprite = tag.value;
          if (tag.type === 'scene') cues.scene = tag.value;
          void this.applyTag(tag);
        }
      };
      const useDemo = store.api.demoMode || !store.api.apiKey.trim();
      const lastUser = [...character.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      let full: string;
      if (useDemo) {
        if (!this.demoHintShown) {
          this.demoHintShown = true;
          toast('离线体验模式：随时可在「API 设置」填入 Key 接入真实模型', 'info', 4200);
        }
        full = await this.demoStream(demoReply(lastUser, character), consume);
      } else {
        full = await streamChat(store.api, turns, consume, this.controller.signal);
      }
      const tail = parser.flush();
      if (tail.text) {
        display += tail.text;
        dialogueBox.append(tail.text);
      }
      for (const tag of tail.tags) {
        if (tag.type === 'sprite') cues.sprite = tag.value;
        if (tag.type === 'scene') cues.scene = tag.value;
        void this.applyTag(tag);
      }
      dialogueBox.endStream();

      const clean = display.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (!clean && !full.trim()) {
        throw new Error('模型没有返回内容');
      }
      const message: ChatMessage = {
        id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        role: 'assistant',
        content: clean || '……',
        createdAt: Date.now(),
        cues: cues.sprite || cues.scene ? cues : undefined,
      };
      store.updateCharacter((c) => {
        c.messages.push(message);
      });
      await store.saveCharacterNow();
      const { levelUp } = store.addBond(8 + Math.min(4, Math.floor(clean.length / 45)));
      if (levelUp) {
        audio.chime('bond');
        stage.shakeBond();
        toast('羁绊加深了', 'bond');
      }
      dialogueBox.showContinue(true);
      this.events.onReplyDone?.(message);
      void (playFixedVoice(clean) ? undefined : this.speakReply(clean));
      void autoBranchSnapshot();
      return message;
    } catch (err) {
      streamError = err;
      if ((err as Error).name === 'AbortError') {
        dialogueBox.finish();
        return null;
      }
      const apiError = err as { hint?: string; message?: string; partial?: string };
      toast(apiError.hint ?? apiError.message ?? '生成失败', 'error', 6000);
      if (apiError.partial && display.trim()) {
        // 断流时保留已经显示出来的半句，不覆盖成通用错误
        dialogueBox.endStream();
        dialogueBox.showContinue(true);
        return null;
      }
      dialogueBox.play('（星光忽然断了——连接好像出了点问题。检查右上角「API 设置」后再试一次。）', { instant: true });
      dialogueBox.showContinue(true);
      return null;
    } finally {
      if (streamError === null || (streamError as Error).name !== 'AbortError') {
        this.setBusy(false);
      }
      this.controller = null;
      if (options.appendUser) {
        /* 用户消息已在调用前写入 */
      }
      void options.isReroll;
    }
  }

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this.busy) return;
    const character = store.character;
    const userMessage: ChatMessage = {
      id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      role: 'user',
      content,
      createdAt: Date.now(),
    };
    store.updateCharacter((c) => {
      c.messages.push(userMessage);
    });
    await store.saveCharacterNow();
    // 用户消息已经写进 history，这里不再重复追加
    const turns = this.buildTurns('', content);
    await this.generate(turns);
  }

  /** 重新生成上一轮 AI 回复 */
  async reroll(): Promise<void> {
    if (this.busy) return;
    const character = store.character;
    const lastAssistant = [...character.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) {
      toast('还没有可以重新生成的回复', 'info');
      return;
    }
    store.updateCharacter((c) => {
      const idx = c.messages.findIndex((m) => m.id === lastAssistant.id);
      if (idx >= 0) c.messages.splice(idx, 1);
    });
    await store.saveCharacterNow();
    const recalled = recallMemories(
      store.character.memories,
      this.recallQuery(lastAssistant.content),
      store.settings.memory.recallTop,
    );
    const turns = turnsForReroll({ character: store.character, memories: recalled });
    await this.generate(turns, { isReroll: true });
  }

  /** 玩家点「继续」：让故事自然往前走一步 */
  async continueScene(): Promise<void> {
    if (this.busy) return;
    const turns = this.buildTurns('（继续）');
    turns[turns.length - 1] = {
      role: 'user',
      content: '（继续这个场景，自然地推进一点点，不要复述上一句，不要说"继续"两个字。）',
    };
    await this.generate(turns);
  }

  /** 手动编辑某条消息（修正 OOC） */
  async editMessage(id: string, content: string): Promise<void> {
    store.updateCharacter((c) => {
      const target = c.messages.find((m) => m.id === id);
      if (target) {
        target.content = content;
        target.edited = true;
      }
    });
    await store.saveCharacterNow();
    toast('已修正这条台词', 'info');
  }

  abort(): void {
    this.controller?.abort();
    this.controller = null;
    this.setBusy(false);
    setBusy(null);
  }
}

export const engine = new DialogueEngine();
