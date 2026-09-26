const { collectActiveBinaryMarkets } = require('./packages/shared/dist/index.js');
collectActiveBinaryMarkets(1).then(m => console.log(JSON.stringify(m, null, 2)));
