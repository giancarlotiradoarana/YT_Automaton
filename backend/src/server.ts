import 'dotenv/config';
import { createApp } from './app';

const PORT = process.env.PORT || 3001;

async function main() {
  const { app } = await createApp();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
