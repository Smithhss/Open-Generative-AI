const PREFIX = 'fyt:studio:draft:v1:';
export const MAX_PROMPT_LENGTH = 6000;

function draftKey(userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('INVALID_USER');
  return `${PREFIX}${userId}`;
}

export function readDraft(storage, userId) {
  try {
    return (storage.getItem(draftKey(userId)) || '').slice(0, MAX_PROMPT_LENGTH);
  } catch {
    return '';
  }
}

export function saveDraft(storage, userId, prompt) {
  storage.setItem(draftKey(userId), prompt.slice(0, MAX_PROMPT_LENGTH));
}
