import type { Character, MemoryEntry } from '../types';
import { visibleText } from './tagParser';
import type { ChatTurn } from './api';

export interface PromptContext {
  character: Character;
  memories: MemoryEntry[];
  historyLimit?: number;
}

const PROTOCOL = `【演出指令协议】你可以在台词中插入以下标签，系统会执行并把标签隐藏，玩家看不到标签本身：
<sprite:立绘名> 切换立绘
<scene:场景名> 切换场景（含氛围粒子）
<fx:zoom|shake|blush> 镜头拉近 / 轻轻震屏 / 脸红柔光
<mem:简短事实> 把值得记住的事实写进羁绊手账，只在真正重要时使用
书写要求：
1. 标签写在句首或句尾，使用英文冒号；每次回复最多一个 <sprite> 与一个 <fx>。
2. 不要把标签写进台词中间，也不要解释标签、不要在回复里提到"标签"二字。
3. 立绘名与场景名必须从上面的列表里原样选择；列表里没有的不要编造。`;

/** 组装 System Prompt：人设 + 可用立绘/场景 + 记忆 + 当前舞台状态 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const { character, memories } = ctx;
  const spriteNames = character.sprites.map((s) => s.name).join(' / ') || '（暂无）';
  const sceneNames = character.scenes.map((s) => s.name).join(' / ') || '（暂无）';
  const currentSprite = character.sprites.find((s) => s.id === character.currentSpriteId)?.name ?? '未设定';
  const currentScene = character.scenes.find((s) => s.id === character.currentSceneId)?.name ?? '未设定';

  const memoryBlock =
    memories.length > 0
      ? memories.map((m) => `- ${m.pinned ? '【刻骨铭心】' : ''}${m.text}`).join('\n')
      : '- （还没有记下什么，慢慢认识对方吧）';

  return `你正在视觉小说《星语剧场》中扮演「${character.name}」，与玩家进行沉浸式对话。

【角色设定】
${character.persona || '（暂无详细设定，请用温和自然的语气与对方相处）'}

【可切换立绘】${spriteNames}
【可切换场景】${sceneNames}
【当前舞台】立绘：${currentSprite} ｜ 场景：${currentScene}

${PROTOCOL}

【你记得的事】
${memoryBlock}

【表演要求】
1. 只输出「${character.name}」要说出口的话，不要写旁白、不要写心理分析、不要用括号解释动作（偶尔一个极短的动作描写可以）。
2. 一般 1~3 句，口语、自然、有呼吸感；对方情绪低落时先接住情绪，再回应内容。
3. 不要主动提到"AI""模型""提示词"，永远保持角色身份。
4. 用中文回复。`;
}

function clean(text: string): string {
  return visibleText(text).trim();
}

/** 组装发给模型的 messages：system + 最近若干轮对话 + 本轮输入 */
export function buildChatTurns(ctx: PromptContext, userText: string): ChatTurn[] {
  const limit = ctx.historyLimit ?? 24;
  const system = buildSystemPrompt(ctx);
  const history = ctx.character.messages
    .slice(-limit)
    .map((m) => ({ role: m.role, content: clean(m.content) }))
    .filter((m) => m.content.length > 0);
  const turns: ChatTurn[] = [{ role: 'system', content: system }, ...history];
  if (userText) turns.push({ role: 'user', content: userText });
  return turns;
}

/** 重新生成时，去掉最后一条 AI 回复再请求 */
export function turnsForReroll(ctx: PromptContext): ChatTurn[] {
  const messages = [...ctx.character.messages];
  while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') messages.pop();
  const trimmed: Character = { ...ctx.character, messages };
  return buildChatTurns({ ...ctx, character: trimmed, historyLimit: ctx.historyLimit }, '');
}
