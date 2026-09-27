const { definePlugin, owncast } = require("@owncast/plugin-sdk");

const COMMANDS_FILE = "commands.json";
const TIMED_MESSAGES_FILE = "timed-messages.json";
const MAX_COMMANDS = 100;
const MAX_TIMED_MESSAGES = 50;
const MAX_MESSAGES_PER_COMMAND = 10;
const MAX_MESSAGE_LENGTH = 500;
const DEFAULT_COMMANDS = [
  {
    command: "!donate",
    messages: ["Thanks for asking! Update this reply with your donation link."],
    cooldownSeconds: 30,
  },
];
const cooldowns = new Map();
let timedMessagesCache;
const timedMessageStates = new Map();

function validateCommands(value) {
  if (!Array.isArray(value) || value.length > MAX_COMMANDS) {
    throw new Error(`Commands must be an array with at most ${MAX_COMMANDS} entries.`);
  }

  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item.command !== "string") {
      throw new Error("Each command needs a command name.");
    }

    const name = item.command.trim().toLowerCase().replace(/^!/, "");
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
      throw new Error("Command names may contain letters, numbers, _ and - only.");
    }
    if (seen.has(name)) throw new Error(`Duplicate command: !${name}`);
    seen.add(name);

    if (
      !Array.isArray(item.messages) ||
      item.messages.length === 0 ||
      item.messages.length > MAX_MESSAGES_PER_COMMAND ||
      item.messages.some(
        (message) =>
          typeof message !== "string" ||
          !message.trim() ||
          message.trim().length > MAX_MESSAGE_LENGTH,
      )
    ) {
      throw new Error(`!${name} needs 1-${MAX_MESSAGES_PER_COMMAND} messages of at most ${MAX_MESSAGE_LENGTH} characters.`);
    }

    const cooldownSeconds = Number(item.cooldownSeconds);
    if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > 86400) {
      throw new Error(`!${name} cooldown must be a whole number from 0 to 86400 seconds.`);
    }
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") {
      throw new Error(`!${name} enabled setting must be a boolean.`);
    }

    return {
      command: `!${name}`,
      messages: item.messages.map((message) => message.trim()),
      cooldownSeconds,
      enabled: item.enabled !== false,
    };
  });
}

function readCommands() {
  if (!owncast.fs.exists(COMMANDS_FILE)) {
    const defaults = validateCommands(DEFAULT_COMMANDS);
    const result = owncast.fs.write(COMMANDS_FILE, JSON.stringify(defaults, null, 2));
    if (result.error) throw new Error(result.error);
    return defaults;
  }

  const saved = owncast.fs.readText(COMMANDS_FILE);
  return validateCommands(JSON.parse(saved));
}

function validateTimedMessages(value) {
  if (!Array.isArray(value) || value.length > MAX_TIMED_MESSAGES) {
    throw new Error(`Timed messages must be an array with at most ${MAX_TIMED_MESSAGES} entries.`);
  }

  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)) {
      throw new Error("Each timed message needs a valid ID.");
    }
    if (seen.has(item.id)) throw new Error(`Duplicate timed message ID: ${item.id}`);
    seen.add(item.id);

    if (typeof item.message !== "string" || !item.message.trim() || item.message.trim().length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Timed message text must be 1-${MAX_MESSAGE_LENGTH} characters.`);
    }
    if (item.trigger !== "interval" && item.trigger !== "chat-count") {
      throw new Error("Timed message trigger must be interval or chat-count.");
    }

    const intervalMinutes = Number(item.intervalMinutes);
    const chatMessageCount = Number(item.chatMessageCount);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
      throw new Error("Interval must be a whole number from 1 to 1440 minutes.");
    }
    if (!Number.isInteger(chatMessageCount) || chatMessageCount < 1 || chatMessageCount > 10000) {
      throw new Error("Chat message count must be a whole number from 1 to 10000.");
    }
    if (typeof item.enabled !== "boolean") throw new Error("Each timed message needs an enabled setting.");

    return {
      id: item.id,
      message: item.message.trim(),
      trigger: item.trigger,
      intervalMinutes,
      chatMessageCount,
      enabled: item.enabled,
    };
  });
}

function resetTimedMessageStates(messages) {
  timedMessageStates.clear();
  messages.forEach((item) => {
    timedMessageStates.set(item.id, { count: 0, lastSentAt: null });
  });
}

function readTimedMessages() {
  if (timedMessagesCache) return timedMessagesCache;

  if (!owncast.fs.exists(TIMED_MESSAGES_FILE)) {
    timedMessagesCache = [];
    const result = owncast.fs.write(TIMED_MESSAGES_FILE, "[]");
    if (result.error) throw new Error(result.error);
  } else {
    timedMessagesCache = validateTimedMessages(
      JSON.parse(owncast.fs.readText(TIMED_MESSAGES_FILE)),
    );
  }
  resetTimedMessageStates(timedMessagesCache);
  return timedMessagesCache;
}

function saveTimedMessages(value) {
  const messages = validateTimedMessages(value);
  const result = owncast.fs.write(TIMED_MESSAGES_FILE, JSON.stringify(messages, null, 2));
  if (result.error) throw new Error(result.error);
  timedMessagesCache = messages;
  resetTimedMessageStates(messages);
  return messages;
}

function processChatCountMessages(msg) {
  if (msg.user?.isBot) return;
  const timedMessages = readTimedMessages();
  timedMessages.forEach((item) => {
    if (!item.enabled || item.trigger !== "chat-count") return;
    const state = timedMessageStates.get(item.id);
    state.count += 1;
    if (state.count >= item.chatMessageCount) {
      state.count = 0;
      owncast.chat.send(item.message);
    }
  });
}

function processIntervalMessages(now) {
  const timedMessages = readTimedMessages();
  timedMessages.forEach((item) => {
    if (!item.enabled || item.trigger !== "interval") return;
    const state = timedMessageStates.get(item.id);
    if (state.lastSentAt === null) {
      state.lastSentAt = now;
      return;
    }
    if (now - state.lastSentAt >= item.intervalMinutes * 60 * 1000) {
      state.lastSentAt = now;
      owncast.chat.send(item.message);
    }
  });
}

function jsonResponse(status, value) {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

module.exports = definePlugin({
  onChatMessage(msg) {
    if (msg.user?.isBot) return;

    try {
      processChatCountMessages(msg);
    } catch (error) {
      owncast.log.error(`Could not process timed chat messages: ${error.message}`);
    }

    const match = msg.body.trim().match(/^!([a-z0-9_-]+)(?:\s|$)/i);
    if (!match) return;

    try {
      const commandName = `!${match[1].toLowerCase()}`;
      const command = readCommands().find((item) => item.command === commandName);
      if (!command || !command.enabled) return;

      const cooldownKey = `${msg.user?.id ?? `client:${msg.clientId ?? "anonymous"}`}:${commandName}`;
      const now = Date.now();
      if (now < (cooldowns.get(cooldownKey) ?? 0)) return;
      if (command.cooldownSeconds > 0) {
        cooldowns.set(cooldownKey, now + command.cooldownSeconds * 1000);
      }

      const message = command.messages[Math.floor(Math.random() * command.messages.length)];
      owncast.chat.send(message);
    } catch (error) {
      owncast.log.error(`Could not handle chat command: ${error.message}`);
    }
  },

  onTick(event) {
    try {
      processIntervalMessages(Number.isFinite(event.now) ? event.now : Date.now());
    } catch (error) {
      owncast.log.error(`Could not process timed chat messages: ${error.message}`);
    }
  },

  onHttpRequest(req) {
    if (!req.authenticated) return jsonResponse(401, { error: "Admin authentication required." });
    if (req.path !== "/admin/api/commands" && req.path !== "/admin/api/timed-messages") {
      return { status: 404 };
    }

    try {
      if (req.path === "/admin/api/timed-messages") {
        if (req.method === "GET") {
          return jsonResponse(200, { timedMessages: readTimedMessages() });
        }
        if (req.method === "PUT") {
          return jsonResponse(200, { timedMessages: saveTimedMessages(JSON.parse(req.body)) });
        }
        return jsonResponse(405, { error: "Method not allowed." });
      }

      if (req.method === "GET") {
        return jsonResponse(200, { commands: readCommands() });
      }
      if (req.method === "PUT") {
        const commands = validateCommands(JSON.parse(req.body));
        const result = owncast.fs.write(COMMANDS_FILE, JSON.stringify(commands, null, 2));
        if (result.error) return jsonResponse(500, { error: result.error });
        return jsonResponse(200, { commands });
      }
      return jsonResponse(405, { error: "Method not allowed." });
    } catch (error) {
      return jsonResponse(400, { error: error.message });
    }
  },
});