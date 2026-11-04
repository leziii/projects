/** Puts text on the clipboard and says so with a short toast. */
export function copyText(text: string, done: string) {
  uni.setClipboardData({ data: text, success: () => uni.showToast({ title: done, icon: 'success' }) });
}
