export const APP_LINK = "https://toss.im/app-links/stockjeokrib";

export async function shareText(text) {
  if (navigator.share) {
    await navigator.share({ text });
    return "shared";
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
