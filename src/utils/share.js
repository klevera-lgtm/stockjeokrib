export const APP_LINK = "https://minion.toss.im/VtK5I1vz";

export async function shareText(text) {
  if (navigator.share) {
    await navigator.share({ text });
    return "shared";
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
