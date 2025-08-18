// Test script to validate payments page data structure
const testPaymentData = [
  {
    "id": "82d18d02-217c-446b-9b36-61e129ee7351",
    "contract_id": "4784ba10-84f9-4ba6-a715-992394c1f3be",
    "milestone_id": null,
    "payer_id": "3b0fb138-1e82-49d7-867a-4569ca188555",
    "payee_id": "d148c0fd-fb68-4cdb-ad96-c50b482e1c73",
    "amount": "150.00",
    "fee": "7.50",
    "net_amount": "142.50",
    "currency": "USD",
    "status": "released",
    "stripe_payment_intent_id": null,
    "created_at": "2025-08-18T22:53:30.007+00:00",
    "updated_at": "2025-08-18T22:53:30.007+00:00",
    "completed_at": "2025-08-18T22:53:30.007+00:00",
    "stripe_transfer_id": null,
    "funded_at": null,
    "released_at": null,
    "payment_type": "contract_release",
    "contract": {
      "title": "Another project"
    },
    "payer": {
      "display_name": "User"
    },
    "payee": {
      "display_name": "Oladosu Najib"
    }
  }
];

const userId = "d148c0fd-fb68-4cdb-ad96-c50b482e1c73"; // Freelancer user ID

// Test stats calculation
const incoming = testPaymentData
  .filter(p => p.payee_id === userId && p.status === 'released')
  .reduce((sum, p) => sum + Number(p.net_amount || p.amount), 0);

const outgoing = testPaymentData
  .filter(p => p.payer_id === userId && p.status === 'released')
  .reduce((sum, p) => sum + Number(p.amount), 0);

const pending = testPaymentData
  .filter(p => (p.payee_id === userId || p.payer_id === userId) && p.status === 'pending')
  .reduce((sum, p) => sum + Number(p.amount), 0);

console.log('Expected stats:');
console.log('- Incoming:', incoming); // Should be 142.50
console.log('- Outgoing:', outgoing); // Should be 0.00
console.log('- Pending:', pending);   // Should be 0.00

// Test payment display logic
const payment = testPaymentData[0];
const isIncoming = payment.payee_id === userId;
const otherParty = isIncoming ? payment.payer : payment.payee;
const displayAmount = isIncoming ? payment.net_amount || payment.amount : payment.amount;

console.log('\nExpected payment display:');
console.log('- Contract:', payment.contract?.title); // "Another project"
console.log('- Direction:', isIncoming ? 'Incoming' : 'Outgoing'); // Incoming
console.log('- From/To:', isIncoming ? 'From' : 'To', otherParty?.display_name); // From User
console.log('- Amount:', isIncoming ? '+' : '-', '$' + Number(displayAmount).toFixed(2)); // +$142.50
console.log('- Status:', payment.status); // released
console.log('- Type:', payment.payment_type === 'contract_release' ? 'Contract Payment' : payment.payment_type); // Contract Payment