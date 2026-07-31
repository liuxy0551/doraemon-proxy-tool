const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

let createAutoTriggerController;
let shouldCancelAutoTrigger;
let bindAutoTriggerCancellation;
let updateAutoTriggerCancellationToast;

try {
    const modulePath = process.env.DORAEMON_DEVOPS_LOGIN_MODULE
        ? path.resolve(__dirname, process.env.DORAEMON_DEVOPS_LOGIN_MODULE)
        : '../src/pages/Content/devops-login.js';
    ({
        createAutoTriggerController,
        shouldCancelAutoTrigger,
        bindAutoTriggerCancellation,
        updateAutoTriggerCancellationToast,
    } = require(modulePath));
} catch (error) {
    createAutoTriggerController = undefined;
    shouldCancelAutoTrigger = undefined;
    bindAutoTriggerCancellation = undefined;
    updateAutoTriggerCancellationToast = undefined;
}

function assertControllerAvailable() {
    assert.equal(
        typeof createAutoTriggerController,
        'function',
        '需要导出 createAutoTriggerController'
    );
}

function assertEventMatcherAvailable() {
    assert.equal(
        typeof shouldCancelAutoTrigger,
        'function',
        '需要导出 shouldCancelAutoTrigger'
    );
}

function assertEventBindingAvailable() {
    assert.equal(
        typeof bindAutoTriggerCancellation,
        'function',
        '需要导出 bindAutoTriggerCancellation'
    );
}

function assertCancellationToastUpdaterAvailable() {
    assert.equal(
        typeof updateAutoTriggerCancellationToast,
        'function',
        '需要导出 updateAutoTriggerCancellationToast'
    );
}

function createFakeTimers() {
    let now = 0;
    let nextId = 1;
    const tasks = new Map();

    return {
        setTimer(callback, delay) {
            const id = nextId++;
            tasks.set(id, { callback, runAt: now + delay });
            return id;
        },
        clearTimer(id) {
            tasks.delete(id);
        },
        advanceBy(duration) {
            const endAt = now + duration;
            while (true) {
                const nextTask = [...tasks.entries()]
                    .filter(([, task]) => task.runAt <= endAt)
                    .sort((left, right) => left[1].runAt - right[1].runAt)[0];
                if (!nextTask) break;

                const [id, task] = nextTask;
                tasks.delete(id);
                now = task.runAt;
                task.callback();
            }
            now = endAt;
        },
    };
}

function createController(events, timers) {
    assertControllerAvailable();
    return createAutoTriggerController({
        delay: 3000,
        countdownDelay: 1500,
        onCountdown: () => events.push('countdown'),
        onTrigger: () => events.push('trigger'),
        onCancel: () => events.push('cancel'),
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
    });
}

function targetFor(selector) {
    return {
        matches(selectorText) {
            return selectorText
                .split(',')
                .map((item) => item.trim())
                .includes(selector);
        },
        closest(selectorText) {
            return selectorText
                .split(',')
                .map((item) => item.trim())
                .includes(selector)
                ? this
                : null;
        },
    };
}

function inputEvent(selector) {
    return { type: 'input', target: targetFor(selector) };
}

function clickEvent(selector) {
    return { type: 'click', target: targetFor(selector) };
}

function createFakeEventTarget() {
    const listeners = new Map();

    return {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        dispatch(event) {
            for (const listener of listeners.get(event.type) || []) {
                listener(event);
            }
        },
        listenerCount() {
            return [...listeners.values()].reduce(
                (count, typeListeners) => count + typeListeners.size,
                0
            );
        },
    };
}

test('cancels before the initial delay completes', () => {
    const events = [];
    const timers = createFakeTimers();
    const controller = createController(events, timers);

    controller.schedule();
    assert.equal(controller.cancel(), true);
    timers.advanceBy(5000);

    assert.deepEqual(events, ['cancel']);
});

test('cancels during the countdown delay', () => {
    const events = [];
    const timers = createFakeTimers();
    const controller = createController(events, timers);

    controller.schedule();
    timers.advanceBy(3000);
    assert.deepEqual(events, ['countdown']);

    assert.equal(controller.cancel(), true);
    timers.advanceBy(1500);

    assert.deepEqual(events, ['countdown', 'cancel']);
});

test('triggers after both delays when not cancelled', () => {
    const events = [];
    const timers = createFakeTimers();
    const controller = createController(events, timers);

    controller.schedule();
    timers.advanceBy(4499);
    assert.deepEqual(events, ['countdown']);

    timers.advanceBy(1);

    assert.deepEqual(events, ['countdown', 'trigger']);
    assert.equal(controller.isPending(), false);
});

test('only reports cancellation once', () => {
    const events = [];
    const timers = createFakeTimers();
    const controller = createController(events, timers);

    controller.schedule();

    assert.equal(controller.cancel(), true);
    assert.equal(controller.cancel(), false);
    assert.deepEqual(events, ['cancel']);
});

test('recognizes explicit user takeover events', () => {
    assertEventMatcherAvailable();

    assert.equal(
        shouldCancelAutoTrigger({ type: 'keydown', key: 'Escape' }),
        true
    );
    assert.equal(shouldCancelAutoTrigger(inputEvent('#username')), true);
    assert.equal(shouldCancelAutoTrigger(inputEvent('#password')), true);
    assert.equal(shouldCancelAutoTrigger(inputEvent('#verify_code')), true);
    assert.equal(
        shouldCancelAutoTrigger(clickEvent('.c-login__container__form__btn')),
        true
    );
    assert.equal(
        shouldCancelAutoTrigger(clickEvent('#doraemon-typing-btn')),
        true
    );
});

test('recognizes captcha image clicks', () => {
    assertEventMatcherAvailable();
    const captchaImage = {};

    assert.equal(
        shouldCancelAutoTrigger(
            { type: 'click', target: captchaImage },
            captchaImage
        ),
        true
    );
});

test('ignores unrelated interactions', () => {
    assertEventMatcherAvailable();

    assert.equal(
        shouldCancelAutoTrigger({ type: 'keydown', key: 'Enter' }),
        false
    );
    assert.equal(
        shouldCancelAutoTrigger(clickEvent('.login-form-blank')),
        false
    );
    assert.equal(shouldCancelAutoTrigger(inputEvent('#search')), false);
});

test('delegated listeners cancel pending login and remove themselves', () => {
    assertEventBindingAvailable();
    const events = [];
    const timers = createFakeTimers();
    const eventTarget = createFakeEventTarget();
    let removeListeners = () => {};
    const controller = createAutoTriggerController({
        delay: 3000,
        countdownDelay: 1500,
        onCountdown: () => events.push('countdown'),
        onTrigger: () => events.push('trigger'),
        onCancel: () => {
            events.push('cancel');
            removeListeners();
        },
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
    });

    removeListeners = bindAutoTriggerCancellation({
        eventTarget,
        controller,
        getCaptchaImage: () => null,
    });
    controller.schedule();
    eventTarget.dispatch(clickEvent('.login-form-blank'));
    assert.deepEqual(events, []);

    eventTarget.dispatch({ type: 'keydown', key: 'Escape' });
    timers.advanceBy(5000);

    assert.deepEqual(events, ['cancel']);
    assert.equal(eventTarget.listenerCount(), 0);
});

test('keeps cancellation silent before countdown toast exists', () => {
    assertCancellationToastUpdaterAvailable();

    assert.equal(updateAutoTriggerCancellationToast(null), false);
});

test('updates the existing countdown toast after countdown starts', () => {
    assertCancellationToastUpdaterAvailable();
    const countdownToast = {
        innerText: '即将自动触发快速登录...',
    };

    assert.equal(updateAutoTriggerCancellationToast(countdownToast), true);
    assert.equal(countdownToast.innerText, '已取消本次自动登录');
});
