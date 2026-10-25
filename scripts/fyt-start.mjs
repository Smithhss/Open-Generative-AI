import { assertTicketSecret } from '../lib/fyt/ticket.mjs';

assertTicketSecret();
await import('../server.js');
