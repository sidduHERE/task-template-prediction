const axios = require('axios');

async function fetchData(openingTimestamp, closingTimestamp) {
  const url = `https://min-api.cryptocompare.com/data/v2/histominute?fsym=BTC&tsym=USD&limit=50&e=Coinbase`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    if (data.Response === 'Success') {
      const histominuteData = data.Data.Data;

      let openingPrice = null;
      let closingPrice = null;

      // Loop through the data objects to find the matching timestamps
      for (const obj of histominuteData) {
        if (obj.time === openingTimestamp) {
          openingPrice = obj.open;
        }
        if (obj.time === closingTimestamp) {
          closingPrice = obj.close;
        }
      }

      return {
        openingPrice,
        closingPrice,
      };
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  }
  return {
    openingPrice: null,
    closingPrice: null,
  };
}

// // Example usage:
// const openingTimestamp = 1688439780;
// const closingTimestamp = 1688440380;

// fetchData(openingTimestamp, closingTimestamp)
//   .then(result => {

//     console.log('Opening Price:', result.openingPrice);
//     console.log('Closing Price:', result.closingPrice);
//   });
module.exports = fetchData;
