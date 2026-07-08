// JSON-LD structured data for the site. Volunteer Gang is a volunteer
// initiative (NGO-like), not a physical business, so we emit Organization/NGO
// + WebSite rather than LocalBusiness.

export interface OrgInfo {
  name: string;
  logo?: string;
  sameAs?: string[];
}

export function siteGraph(site: URL | undefined, org: OrgInfo): object[] {
  const base = site ? site.toString().replace(/\/$/, '') : '';
  const url = base || undefined;
  return [
    {
      '@type': ['Organization', 'NGO'],
      '@id': `${base}/#org`,
      name: org.name,
      url,
      ...(org.logo ? { logo: base + org.logo } : {}),
      ...(org.sameAs && org.sameAs.length ? { sameAs: org.sameAs } : {}),
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      name: org.name,
      url,
      inLanguage: 'uk',
      publisher: { '@id': `${base}/#org` },
    },
  ];
}
