import { config } from 'dotenv';
import path from 'node:path';

// Match the documented local workflow while preserving values supplied by the shell or CI.
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });
