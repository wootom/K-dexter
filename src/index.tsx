#!/usr/bin/env bun
import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { CLI } from './cli.js';

// Render the CLI app and wait for it to exit
// This keeps the process alive until the user exits
const { waitUntilExit } = render(<CLI />);
await waitUntilExit();
