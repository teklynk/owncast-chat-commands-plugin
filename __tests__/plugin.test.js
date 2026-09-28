// Scenario tests for this plugin. Each scenario dispatches an event sequence
// against the real plugin runtime (with a mocked host) and asserts on the
// side effects it observed: chatSends, kv writes, emitted events, HTTP
// requests the plugin made, etc.
//
// Runs via `npm test` (which builds your plugin first, then runs this file).
const { runScenarios } = require("@owncast/plugin-sdk/testing");

// Small helper so each scenario doesn't repeat the event shape. You can build
// scenarios any way you like in JS, loops, fixtures, computed payloads.
// `user` is a ChatUser object; this helper builds one from a display name so
// the call sites below stay terse.
const incomingChat = (name, body) => ({
  event: "chat.message.received",
  payload: {
    id: "1",
    user: { id: name, displayName: name },
    body,
    timestamp: "2024-01-01T00:00:00Z",
  },
});

runScenarios([
  {
    name: "replies to the default donate command",
    events: [incomingChat("alice", "!donate")],
    expect: {
      chatSends: ["Thanks for asking! Update this reply with your donation link."],
    },
  },
  {
    name: "leaves unconfigured chat messages alone",
    events: [incomingChat("bob", "good morning"), incomingChat("bob", "!unknown")],
    expect: { chatSends: [] },
  },
  {
    name: "uses commands saved from the admin page and enforces cooldowns",
    events: [
      {
        http: {
          method: "PUT",
          path: "/admin/api/commands",
          authenticated: true,
          body: JSON.stringify([
            { command: "!schedule", message: "Tonight at eight.", cooldownSeconds: 60 },
          ]),
          expect: { status: 200 },
        },
      },
      incomingChat("carol", "!schedule"),
      incomingChat("carol", "!schedule"),
    ],
    expect: { chatSends: ["Tonight at eight."] },
  },
  {
    name: "treats duplicate commands as random multiline replies",
    events: [
      {
        http: {
          method: "PUT",
          path: "/admin/api/commands",
          authenticated: true,
          body: JSON.stringify([
            { command: "!schedule", message: "Tonight at eight.\nSee you there!", cooldownSeconds: 0 },
            { command: "!schedule", message: "Tonight at eight.\nSee you there!", cooldownSeconds: 0 },
          ]),
          expect: { status: 200 },
        },
      },
      incomingChat("casey", "!schedule"),
    ],
    expect: { chatSends: ["Tonight at eight.\nSee you there!"] },
  },
  {
    name: "does not run a disabled saved command",
    events: [
      {
        http: {
          method: "PUT",
          path: "/admin/api/commands",
          authenticated: true,
          body: JSON.stringify([
            {
              command: "!paused",
              message: "This should not be posted.",
              cooldownSeconds: 0,
              enabled: false,
            },
          ]),
          expect: { status: 200 },
        },
      },
      incomingChat("dana", "!paused"),
    ],
    expect: { chatSends: [] },
  },
  {
    name: "rejects unauthenticated admin API requests",
    events: [
      {
        http: {
          method: "GET",
          path: "/admin/api/commands",
          expect: { status: 401 },
        },
      },
    ],
    expect: { chatSends: [] },
  },
  {
    name: "posts a timed message after the configured number of chat messages",
    events: [
      {
        http: {
          method: "PUT",
          path: "/admin/api/timed-messages",
          authenticated: true,
          body: JSON.stringify([
            {
              id: "count-reminder",
              message: "Remember to follow the channel.",
              trigger: "chat-count",
              intervalMinutes: 30,
              chatMessageCount: 2,
              enabled: true,
            },
          ]),
          expect: { status: 200 },
        },
      },
      incomingChat("alice", "hello"),
      incomingChat("bob", "good evening"),
    ],
    expect: { chatSends: ["Remember to follow the channel."] },
  },
  {
    name: "posts an interval message when its interval elapses",
    events: [
      {
        http: {
          method: "PUT",
          path: "/admin/api/timed-messages",
          authenticated: true,
          body: JSON.stringify([
            {
              id: "interval-reminder",
              message: "Take a look at the stream schedule.",
              trigger: "interval",
              intervalMinutes: 1,
              chatMessageCount: 20,
              enabled: true,
            },
          ]),
          expect: { status: 200 },
        },
      },
      { event: "tick", payload: { now: 1000 } },
      { event: "tick", payload: { now: 30000 } },
      { event: "tick", payload: { now: 61000 } },
    ],
    expect: { chatSends: ["Take a look at the stream schedule."] },
  },
]);
