import dotenv from 'dotenv';
import path from 'path';

// Load .env so credentials are available in tests
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
