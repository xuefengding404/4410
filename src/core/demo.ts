import type { Character } from '../types';

function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/**
 * 离线体验模式的本地剧本回复。
 * 不需要 Key、不联网，但依然走完整的标签协议（立绘 / 场景 / 特效 / 记忆）。
 */
export function demoReply(userText: string, character: Character): string {
  const text = userText.trim();
  const sprite = (name: string): string => {
    const hit = character.sprites.find((s) => s.name === name);
    return hit ? `<sprite:${hit.name}>` : '';
  };
  const scene = (name: string): string => {
    const hit = character.scenes.find((s) => s.name === name);
    return hit ? `<scene:${hit.name}>` : '';
  };
  const first = character.sprites[0]?.name ?? '常态微笑';

  for (const sp of character.sprites) {
    if (text.includes(sp.name)) {
      return `<sprite:${sp.name}><fx:zoom>你是想看我「${sp.name}」的样子吗？……好啦，现在已经为你换好了，满意吗？`;
    }
  }

  for (const sc of character.scenes) {
    if (text.includes(sc.name)) {
      return `${scene(sc.name)}${sprite('开心眨眼')}<fx:zoom>好呀，那我们现在就去「${sc.name}」吧。这里的氛围，是不是和你想象的一样？`;
    }
  }

  if (/记住|别忘|过敏|怕黑|喜欢吃什么/.test(text)) {
    const fact = text
      .replace(/^记住[：:\s]*/, '')
      .replace(/[。！？!?.\s]+$/, '')
      .trim();
    return `${sprite('认真思考')}<mem:${fact}>嗯，我已经悄悄记在小本本上了——「${fact}」。以后不管聊多久，我都不会忘记的。`;
  }

  if (/喜欢你|爱你|心动|抱抱|亲亲|想你/.test(text)) {
    return `${sprite('害羞脸红')}<fx:blush>突、突然说这种话……就算是我，心跳也会漏掉半拍的呀。不过……我也很高兴你愿意告诉我。`;
  }

  if (/生气|讨厌|滚|烦|难过|不开心/.test(text)) {
    return `${sprite('认真思考')}<fx:shake>诶……是我哪里惹你不开心了吗？别气别气，告诉我发生什么事了好不好？`;
  }

  if (/你好|在吗|嗨|hi|hello/i.test(text)) {
    return `${sprite('常态微笑')}我在的。雨声刚刚好，我一直坐在这里等你开口呢。`;
  }

  return pick(
    [
      `${sprite('常态微笑')}我听着呢。「${text}」——如果是现在的你，接下来想在这段故事里发生什么呢？`,
      `${sprite('认真思考')}唔……「${text}」这件事，我想再听你讲得细一点。今天的你，好像藏着很多心事。`,
      `${sprite('开心眨眼')}原来你在想这个呀。外面的雨还在下，我们可以慢慢聊，不着急。`,
      `${sprite(first)}嗯，我记住了。你说的每一句话，我都会好好收着。`,
    ],
    `${text}-${character.messages.length}`,
  );
}
