export async function shareKakao(text, link) {
  await navigator.clipboard.writeText(`${text}\n${link}`).catch(() => {});
  window.location.href = "kakaotalk://";
}
