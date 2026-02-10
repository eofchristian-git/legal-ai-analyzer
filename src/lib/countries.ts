export interface Country {
  code: string;
  name: string;
  flag: string;
}



export const COUNTRIES: Country[] = [
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "US", name: "United States", flag: "🇺🇸" },
];

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
