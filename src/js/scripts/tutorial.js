// website/src/js/scripts/tutorial.js
import { isTouchDevice, applyWaverEffect } from '/js/scripts/effects.js';

import { PROMOTIONAL } from '../strings.js';

let activeTutorials = [];
let tutorialTimer = null;

function positionElement(tutorialContainer, anchorElement, position) {
    if (!anchorElement) return;
    const rect = anchorElement.getBoundingClientRect();
    
    let top, left, transform;

    if (position === 'above') {
        top = rect.top + window.scrollY + (rect.height / 2);
        left = rect.left + window.scrollX + (rect.width / 2);
        transform = 'translate(-50%, -100%) translateY(-40px)';
    } else if (position === 'continue-offset') {
        // Position more up and to the right
        top = rect.top + window.scrollY + (rect.height / 2) - 85;
        left = rect.left + window.scrollX + (rect.width / 2) + 110;
        transform = 'translate(-50%, -50%) rotate(10deg)';
    } else {
        top = rect.top + window.scrollY + (rect.height / 2);
        left = rect.right + window.scrollX;
        transform = 'translate(10px, -50%)';
    }
    
    tutorialContainer.style.top = `${top}px`;
    tutorialContainer.style.left = `${left}px`;
    tutorialContainer.style.transform = transform;
}

function createAndShowTutorial(text, anchorSelector, position = 'top-right') {
    const anchorElement = document.querySelector(anchorSelector);
    if (!anchorElement) return null;

    const tutorialContainer = document.createElement('div');
    tutorialContainer.className = 'tutorial-container';

    const tutorialContent = document.createElement('div');
    tutorialContent.className = 'tutorial-text waver';
    tutorialContent.textContent = text;
    
    // Apply centralized waver effect
    applyWaverEffect(tutorialContent, {
        intensityX: 0, // Only vertical for tutorials
        intensityY: -5,
        baseDurationX: 6,
        baseDurationY: 6,
        variation: 0.4
    });
    
    tutorialContainer.appendChild(tutorialContent);
    document.body.appendChild(tutorialContainer);
    
    const tutorial = { el: tutorialContainer, anchor: anchorElement, position: position };
    activeTutorials.push(tutorial);

    positionElement(tutorial.el, tutorial.anchor, tutorial.position);
    
    setTimeout(() => tutorial.el.classList.add('visible'), 50);

    return tutorial;
}

function showTutorial() {
    hideTutorial(); // Clear any existing tutorials

    const explanationText = isTouchDevice() 
        ? PROMOTIONAL.TOOLTIPS.EXPLANATION_TOUCH 
        : PROMOTIONAL.TOOLTIPS.EXPLANATION;

    createAndShowTutorial(PROMOTIONAL.TOOLTIPS.BRAINROT, '#mode-toggle-container', 'above');
    createAndShowTutorial(explanationText, '#console-button', 'continue-offset');
    
    window.addEventListener('resize', handleResize);
}

export function planToShowTutorial(delay) {
    cancelPlannedTutorial(); // Cancel any existing plan
    tutorialTimer = setTimeout(showTutorial, delay);
}

export function cancelPlannedTutorial() {
    if (tutorialTimer) {
        clearTimeout(tutorialTimer);
        tutorialTimer = null;
    }
}

export function hideTutorial() {
    cancelPlannedTutorial(); // Also cancel any pending timers
    activeTutorials.forEach(({ el }) => {
        el.remove();
    });
    activeTutorials = [];
    window.removeEventListener('resize', handleResize);
}

function handleResize() {
    activeTutorials.forEach(({ el, anchor, position }) => {
        positionElement(el, anchor, position);
    });
}
