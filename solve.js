const b = 1000000;
const shares = 4000000;

function lmsrCost(b, yes, no) {
    const maxQ = Math.max(yes / b, no / b);
    return b * (maxQ + Math.log(Math.exp(yes / b - maxQ) + Math.exp(no / b - maxQ)));
}

// 1. Check human scaling
console.log("Human scaling:", lmsrCost(1, 4, 0) - lmsrCost(1, 0, 0));

// 2. Check if yesSupply = something else
// What if yesSupply = 4000000 and we buy 4000000 more?
console.log("yes=4m:", lmsrCost(b, 8000000, 0) - lmsrCost(b, 4000000, 0));

// What if it's newYes/b * something?
console.log("raw e^4:", Math.exp(4));

// Loop to find yesSupply that yields ~15.20181 cost? No, max cost for 4 shares is 4.0.
// LMSR cost for 4 shares is bounded by 4.0. It CANNOT be 15.20!
