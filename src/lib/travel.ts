export const destinationForCountry = (name: string): string =>
  name === "Taiwan" ? "China" : name;
export const groupDestinations = (countries: readonly string[]): string[] => [
  ...new Set(countries.map(destinationForCountry)),
];
export const isVisitedCountry = (
  name: string,
  destinations: readonly string[],
): boolean =>
  groupDestinations(destinations).includes(destinationForCountry(name));

const labels: Record<string, string> = {
  China: "中国",
  Taiwan: "中国·台湾",
  "Northern Cyprus": "塞浦路斯北部",
  Somaliland: "索马里兰",
  "West Bank": "约旦河西岸",
};
const englishRegions = new Intl.DisplayNames(["en"], { type: "region" });
const chineseRegions = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const countryCodes: Record<string, string> = {};
// Intl supplies the complete ISO 3166 alpha-2 name table, without shipping a second world dataset.
for (let first = 65; first <= 90; first++) {
  for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second);
    const english = englishRegions.of(code);
    if (english && english !== code) countryCodes[english] = code;
  }
}
// The source map uses historical names and a few aliases rather than current CLDR names.
Object.assign(countryCodes, {
  "French Southern and Antarctic Lands": "TF",
  "The Bahamas": "BS",
  "Bosnia and Herzegovina": "BA",
  "Ivory Coast": "CI",
  "Democratic Republic of the Congo": "CD",
  "Republic of the Congo": "CG",
  "Czech Republic": "CZ",
  England: "GB",
  "Guinea Bissau": "GW",
  Macedonia: "MK",
  Myanmar: "MM",
  "Republic of Serbia": "RS",
  Swaziland: "SZ",
  "East Timor": "TL",
  "Trinidad and Tobago": "TT",
  Turkey: "TR",
  "United Republic of Tanzania": "TZ",
  USA: "US",
  "United States of America": "US",
});
export const countryLabel = (name: string): string =>
  labels[name] ?? chineseRegions.of(countryCodes[name] ?? "ZZ") ?? "其他地区";
