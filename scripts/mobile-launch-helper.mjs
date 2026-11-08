export async function dismissMobileWelcome(page) {
  const needs = await page.evaluate(() => {
    let preference = true;
    try {
      preference =
        JSON.parse(localStorage.getItem('apex.v2'))?.settings?.immersiveWelcome !== false;
    } catch {}
    return (
      (navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches) &&
      Math.min(screen.width, screen.height) <= 600 &&
      preference &&
      !matchMedia('(display-mode:standalone)').matches
    );
  });
  if (needs) {
    const button = page.getByRole('button', { name: 'Continue in Browser', exact: true });
    await button.waitFor({ timeout: 60000 });
    await button.click();
  }
}
