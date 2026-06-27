const EBAY_CAMPAIGN_ID = process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID || '';
const EBAY_CUSTOM_ID = process.env.NEXT_PUBLIC_EBAY_CUSTOM_ID || '';

function buildCardQuery(cardName = '', cardNumber = '') {
  return `${cardName} ${cardNumber}`.replace(/\s+/g, ' ').trim();
}

export function buildEbaySearchUrl(cardName = 'Pokemon card', cardNumber = '') {
  const query = encodeURIComponent(buildCardQuery(cardName, cardNumber) || 'Pokemon card');
  const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_BIN=1&sop=15`;

  if (!EBAY_CAMPAIGN_ID) {
    return searchUrl;
  }

  const roverParams = new URLSearchParams({
    campid: EBAY_CAMPAIGN_ID,
    customid: EBAY_CUSTOM_ID,
    toolid: '10001',
    mpre: searchUrl,
  });

  return `https://rover.ebay.com/rover/1/711-53200-19255-0/1?${roverParams.toString()}`;
}