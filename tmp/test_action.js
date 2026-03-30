
const { getBalanceMovement } = require('./app/actions/balance-movement');

async function test() {
    try {
        const result = await getBalanceMovement({ category: 'purchase' });
        console.log('Success!', result.data.length);
    } catch (e) {
        console.error('Failed!', e);
    }
}

test();
