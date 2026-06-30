const REGISTRAR_LINKS: Record<string, string> = {
  go: "https://www.godaddy.com/domainsearch/find?domainToCheck={domain}&checkAvail=1",
  nc: "https://www.namecheap.com/domains/registration/results/?domain={domain}",
  cf: "https://www.cloudflare.com/products/registrar/{domain}",
  google: "https://domains.google.com/registrar/#search={domain}",
};

interface AvailabilityResult {
  domain: string;
  available: boolean;
  registrarLinks: Record<string, string>;
  checkedAt: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkAvailability(domain: string): Promise<AvailabilityResult> {
  const fullDomain = domain.includes(".") ? domain : `${domain}.com`;
  let available = false;

  try {
    const whoiser = (await import("whoiser")).default;
    const whoisData = await whoiser(fullDomain, { timeout: 5000 });
    const hosts = Object.values(whoisData) as Record<string, unknown>[];
    const hasData = hosts.some((h) => h && Object.keys(h).length > 0);
    available = !hasData;
    await sleep(100);
  } catch {
    available = false;
  }

  const registrarLinks: Record<string, string> = {};
  for (const [key, url] of Object.entries(REGISTRAR_LINKS)) {
    registrarLinks[key] = url.replace(/{domain}/g, fullDomain);
  }

  return {
    domain: fullDomain,
    available,
    registrarLinks,
    checkedAt: new Date().toISOString(),
  };
}
