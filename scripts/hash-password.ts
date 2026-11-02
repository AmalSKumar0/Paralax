import bcrypt from 'bcryptjs';

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: npm run hash-password -- <plaintext_password>');
    console.error('Example: npm run hash-password -- "my-secure-password"');
    process.exit(1);
  }

  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log('\n--- Generated Password Hash ---');
  console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
  console.log('-------------------------------\n');
  console.log('Set this value in your .env or Vercel environment variables.');
}

main().catch((err) => {
  console.error('Error hashing password:', err);
  process.exit(1);
});
