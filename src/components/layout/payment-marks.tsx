// Acceptance marks for what Stripe Checkout takes: cards, plus Apple Pay and Google Pay
// on devices that support them. Drawn inline so the footer needs no extra requests.
const chip = { width: 46, height: 30, viewBox: "0 0 46 30", role: "img" as const };

export function PaymentMarks() {
  return (
    <ul className="payment-marks">
      <li>
        <svg {...chip} aria-label="Visa">
          <rect width="46" height="30" rx="5" fill="#fff" />
          <text x="23" y="19.5" textAnchor="middle" fill="#1a1f71" fontSize="12" fontWeight="800" fontStyle="italic">
            VISA
          </text>
        </svg>
      </li>
      <li>
        <svg {...chip} aria-label="Mastercard">
          <rect width="46" height="30" rx="5" fill="#fff" />
          <circle cx="19" cy="15" r="8" fill="#eb001b" />
          <circle cx="27" cy="15" r="8" fill="#f79e1b" />
          <path d="M23 8.1a8 8 0 0 1 0 13.8 8 8 0 0 1 0-13.8Z" fill="#ff5f00" />
        </svg>
      </li>
      <li>
        <svg {...chip} aria-label="American Express">
          <rect width="46" height="30" rx="5" fill="#2e77bc" />
          <text x="23" y="19" textAnchor="middle" fill="#fff" fontSize="9.5" fontWeight="800" letterSpacing="0.5">
            AMEX
          </text>
        </svg>
      </li>
      <li>
        <svg {...chip} aria-label="Apple Pay">
          <rect width="46" height="30" rx="5" fill="#000" />
          <path
            d="M14.6 10.9c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.3-.8 2.1.8.1 1.6-.4 2.2-1Zm.7 1.2c-1.2-.1-2.2.7-2.8.7-.6 0-1.4-.6-2.4-.6-1.2 0-2.4.7-3 1.8-1.3 2.2-.3 5.5.9 7.3.6.9 1.3 1.8 2.3 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.4.6 1.6-.9 2.2-1.8c.7-1 1-2 1-2-.1 0-1.9-.7-1.9-2.8 0-1.8 1.5-2.6 1.5-2.7-.8-1.2-2.1-1.4-2.5-1.5Z"
            fill="#fff"
          />
          <text x="30" y="20" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600">
            Pay
          </text>
        </svg>
      </li>
      <li>
        <svg {...chip} aria-label="Google Pay">
          <rect width="46" height="30" rx="5" fill="#fff" />
          <text x="13" y="20" textAnchor="middle" fontSize="12" fontWeight="700" fill="#4285f4">
            G
          </text>
          <text x="28" y="20" textAnchor="middle" fill="#3c4043" fontSize="11" fontWeight="600">
            Pay
          </text>
        </svg>
      </li>
    </ul>
  );
}
