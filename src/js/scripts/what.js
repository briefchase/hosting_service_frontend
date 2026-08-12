// website/src/js/scripts/what.js
import { prompt } from '/js/pages/prompt.js';
import { TextScramble } from '/js/scripts/effects.js';
import { PROMOTIONAL, SYSTEM, DOMAINS } from '../strings.js';

const adjectives = PROMOTIONAL.WHAT_IS_THIS.ADJECTIVES;

export async function showWhatPrompt() {
    const promptText = PROMOTIONAL.WHAT_IS_THIS.HTML;

    const promptPromise = prompt(SYSTEM.PROMPTS.WHAT_IS_THIS(promptText));

    // Wait a tick for the prompt to render to the DOM
    await new Promise(resolve => setTimeout(resolve, 0));

    const scrambleEl = document.getElementById('adjective-scramble');
    if (scrambleEl) {
        const scramble = new TextScramble(scrambleEl, {
            idleScramble: {
                probability: 0.7, // 70% chance to have an idle scramble
                maxInstances: 1,
                interval: 2500, // Max delay for an idle scramble to start (must be < cycle interval)
            }
        });
        const animationControl = scramble.cycle(adjectives, 3000);

        // Clean up the interval when the prompt is closed
        promptPromise.finally(() => {
            animationControl.stop();
        });
    }

    await promptPromise;
}

