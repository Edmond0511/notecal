// Quick test of the mock API functionality
const { mockResolveLine } = require('./services/mockApi.ts');

async function testMockApi() {
  console.log('Testing mock API...');

  const testCases = [
    'oats, 50g',
    'chicken breast 100g',
    '2 eggs',
    'banana',
    'rice, 75g'
  ];

  for (const testCase of testCases) {
    console.log(`\nTesting: "${testCase}"`);
    try {
      const result = await mockResolveLine(testCase);
      console.log('✅ Success:', {
        items: result.resolved.length,
        totalKcal: result.totals.kcal,
        totalProtein: result.totals.protein,
        totalFat: result.totals.fat
      });

      if (result.resolved.length > 0) {
        console.log('First item:', {
          label: result.resolved[0].label,
          qty: result.resolved[0].qty,
          unit: result.resolved[0].unit,
          confidence: result.resolved[0].confidence
        });
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }
}

testMockApi().catch(console.error);