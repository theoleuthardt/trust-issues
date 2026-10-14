import { createVerifierServer } from './server';

const MIN_TOKEN_LENGTH = 32;
const PLACEHOLDER = /change[-_ ]?me|example|secret/i;

const token = process.env.VERIFIER_TOKEN ?? '';
if (token.length < MIN_TOKEN_LENGTH || PLACEHOLDER.test(token)) {
  console.error(
    `VERIFIER_TOKEN must be set to a random value of at least ${MIN_TOKEN_LENGTH} characters`,
  );
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8081);
createVerifierServer({ token }).listen(port, '0.0.0.0', () => {
  console.log(`verifier listening on :${port}`);
});
