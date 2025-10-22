#!/usr/bin/env node
import { Command } from 'commander';
import express from 'express';
import { jsonToZod } from 'json-to-zod';
import { highlight } from 'cli-highlight';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const program = new Command();

program
  .name('klonk')
  .description('CLI for Klonk workflow automation engine')
  .version('0.1.18');

program
    .command('test')
    .description('Run a test to check if the CLI is working.')
    .action(() => {
        console.log('TEST SUCCESSFUL');
    });

const setupCommand = program.command('setup')
  .description('Setup integrations');

const setupIntegrationCommand = setupCommand.command('integration')
  .description('Setup a specific integration');

setupIntegrationCommand
  .command('dropbox')
  .description('Get a refresh token for Dropbox')
  .action(async () => {
      const rl = readline.createInterface({ input, output });

      const appKey = await rl.question('Enter your Dropbox App Key: ');
      const appSecret = await rl.question('Enter your Dropbox App Secret: ');

      console.log(`\nPlease go to this URL to authorize the app:\nhttps://www.dropbox.com/oauth2/authorize?client_id=${appKey}&response_type=code&token_access_type=offline\n`);

      const authCode = await rl.question('Paste the authorization code here: ');
      rl.close();

      try {
          const response = await fetch('https://api.dropbox.com/oauth2/token', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Authorization': `Basic ${Buffer.from(`${appKey}:${appSecret}`).toString('base64')}`
              },
              body: new URLSearchParams({
                  'code': authCode,
                  'grant_type': 'authorization_code'
              })
          });

          const data = await response.json();

          if (!response.ok) {
              console.error('\nError getting refresh token:');
              console.error(highlight(JSON.stringify(data, null, 2), { language: 'json' }));
              process.exit(1);
          }

          console.log('\nSuccess! Here are your tokens:');
          console.log(highlight(JSON.stringify(data, null, 2), { language: 'json' }));
          console.log('\nStore the `refresh_token` securely. You will use it, along with your app key and secret, to configure the Dropbox integration.');

      } catch (error) {
          console.error('\nAn error occurred while fetching the refresh token:', error);
      }
  });

const introspectCommand = program.command('introspect')
  .description('Introspection utilities');

introspectCommand
  .command('webhook-payload')
  .description('Introspect a webhook payload')
  .option('--gt, --generate-type', 'Generate a TypeScript type definition for the payload')
  .option('-p, --port <port>', 'Port to listen on', '2021')
  .option('--base-url <url>', 'Base URL for the webhook endpoint')
  .action(async (options) => {
    const app = express();
    app.use(express.json());

    const port = parseInt(options.port, 10);
    const displayUrl = options.baseUrl ? options.baseUrl : `http://localhost:${port}`;

    let server: ReturnType<typeof app.listen> | null = null;

    // This function will be called to gracefully shut down the server.
    const closeServer = () => {
      if (server) {
        server.close(() => {
          console.log('\nServer closed.');
          process.exit(0);
        });
      }
    };

    // Define the GET handler for the challenge.
    app.get('/', (req, res) => {
      const challenge = req.query.challenge;
      if (challenge && typeof challenge === 'string') {
        console.log(`\nReceived verification challenge. Responding with: ${challenge}`);
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).send(challenge);
        console.log('Challenge response sent. Waiting for POST payload...');
        return; // Keep the server running for the POST request.
      }
      console.warn(`\nReceived GET request to / without a 'challenge' parameter.`);
      res.status(400).send('Bad Request: Missing "challenge" query parameter.');
    });

    // Define the POST handler for the payload.
    app.post('/', (req, res) => {
      const payload = req.body;
      console.log('\nWebhook Payload:');
      // Highlight JSON output
      console.log(highlight(JSON.stringify(payload, null, 2), { language: 'json', ignoreIllegals: true }));

      if (options.generateType) {
        try {
          const zodSchemaString = jsonToZod(payload, 'PayloadSchema', true);
          const typeAliasString = "\ntype Payload = z.infer<typeof PayloadSchema>;";
          const combinedOutput = zodSchemaString + typeAliasString;

          console.log('\nGenerated Zod Schema & TypeScript Type:');
          console.log(highlight(combinedOutput, { language: 'typescript', ignoreIllegals: true }));
        } catch (error) {
          console.error('\nError generating Zod schema:', error);
        }
      }
      res.status(200).send('Payload received');
      // Now that we've received the payload, we can close the server.
      closeServer();
    });

    // Start the server *after* all routes have been defined.
    server = app.listen(port, () => {
      console.log(`Listening for webhook payload on ${displayUrl}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  });

program.parse(process.argv); 