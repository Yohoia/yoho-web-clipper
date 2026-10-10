export const CLIP_TYPES = Object.freeze(['article', 'full_page', 'simplified', 'selection', 'bookmark', 'screenshot']);
export const DEFAULT_PREFERENCES = Object.freeze({
  defaultClipType: 'article', topicStrategy: 'recent', afterClip: 'stay',
  saveShortcutEnabled: true, reduceMotion: false,
});

export function resolvePreferences(stored = {}) {
  return {
    defaultClipType: [...CLIP_TYPES, 'recent'].includes(stored?.defaultClipType) ? stored.defaultClipType : DEFAULT_PREFERENCES.defaultClipType,
    topicStrategy: ['recent', 'learning'].includes(stored?.topicStrategy) ? stored.topicStrategy : DEFAULT_PREFERENCES.topicStrategy,
    afterClip: ['stay', 'open', 'close'].includes(stored?.afterClip) ? stored.afterClip : DEFAULT_PREFERENCES.afterClip,
    saveShortcutEnabled: typeof stored?.saveShortcutEnabled === 'boolean' ? stored.saveShortcutEnabled : true,
    reduceMotion: typeof stored?.reduceMotion === 'boolean' ? stored.reduceMotion : false,
  };
}
