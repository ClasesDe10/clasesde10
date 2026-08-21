#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [chat, css, rules, familyDashboard, professorDashboard, adminDashboard] = await Promise.all([
  readFile(new URL('../js/chat-widget.js', import.meta.url), 'utf8'),
  readFile(new URL('../css/dashboard.css', import.meta.url), 'utf8'),
  readFile(new URL('../firebase/firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/admin.html', import.meta.url), 'utf8'),
]);

assert.match(familyDashboard, /initChatWidget\(\{[\s\S]*?role:\s*'familia'[\s\S]*?showNotifications:\s*false/, 'Family dashboard must use the complete shared chat widget.');
assert.match(professorDashboard, /initChatWidget\(\{[\s\S]*?role:\s*'profesor'[\s\S]*?showNotifications:\s*false/, 'Professor dashboard must use the complete shared chat widget.');
assert.match(adminDashboard, /initChatWidget\(\{[\s\S]*?role:\s*'admin'[\s\S]*?showNotifications:\s*false/, 'Admin dashboard must use the complete shared chat widget.');
assert.match(familyDashboard, /chat-widget\.js\?v=20260821-chat-teacher-photo/, 'Family chat must load the current shared widget version.');
assert.match(professorDashboard, /chat-widget\.js\?v=20260821-chat-teacher-photo/, 'Professor chat must load the current shared widget version.');
assert.match(adminDashboard, /chat-widget\.js\?v=20260821-chat-teacher-photo/, 'Admin chat must load the current shared widget version.');

assert.match(chat, /\[`unreadBy\.\$\{uid\}`\] = increment\(1\)/, 'Each recipient must receive an unread counter increment.');
assert.match(chat, /deliveredAtBy/, 'The chat must persist delivered receipts.');
assert.match(chat, /readAtBy/, 'The chat must persist read receipts.');
assert.match(chat, /data-chat-nav-unread/, 'The sidebar must expose an unread badge.');
assert.match(chat, /data-chat-menu-unread/, 'Mobile navigation must expose an unread badge.');
assert.match(chat, /notifyIncomingChatMessage/, 'Incoming messages must trigger an in-app notification.');
assert.match(chat, /showBrowserNotification/, 'Incoming messages must support browser notifications.');
assert.match(chat, /document\.title = totalUnread/, 'Unread messages must be visible in the browser title.');

assert.match(chat, /batch\.set\(messageRef, payload\)/, 'Message creation must be committed atomically.');
assert.match(chat, /batch\.update\(chatRef, chatAfterMessageUpdates/, 'Message previews and unread counters must share the atomic commit.');
assert.match(chat, /data-chat-reply-message/, 'Messages must support replies.');
assert.match(chat, /data-chat-copy-message/, 'Messages must support copying.');
assert.match(chat, /data-chat-toggle-emoji/, 'The composer must include quick emojis.');
assert.match(chat, /cd10_chat_drafts_/, 'Drafts must persist on the current device.');
assert.match(chat, /data-chat-start-call="voice"/, 'Voice calls must remain available.');
assert.match(chat, /data-chat-start-call="video"/, 'Video calls must remain available.');
assert.match(chat, /chat-call-primary[\s\S]*?<span>Llamar<\/span>/, 'Voice calls must be a clearly labelled primary chat action.');
assert.match(css, /\.chat-call-primary\s*\{[\s\S]*?min-width:[\s\S]*?background:\s*var\(--navy\)/, 'The primary call action must remain visually prominent.');
assert.match(css, /\.chat-header-utility\s*\{\s*display:\s*none;/, 'Mobile chat must prioritize call controls over secondary utilities.');
assert.match(chat, /data-chat-thread-search-input/, 'Chats must support searching inside the selected conversation.');
assert.match(chat, /data-chat-react-message/, 'Messages must support persistent emoji reactions.');
assert.match(chat, /data-chat-edit-message/, 'People must be able to edit their own text messages.');
assert.match(chat, /data-chat-delete-message/, 'People must be able to remove their own messages for everyone.');
assert.match(chat, /data-chat-star-message/, 'People must be able to save important messages.');
assert.match(chat, /starredMessageIds/, 'Saved messages must persist per user and conversation.');
assert.match(chat, /orderBy\('createdAt', 'desc'\)[\s\S]*?limit\(250\)[\s\S]*?\.reverse\(\)/, 'The chat must load the latest message history and render it chronologically.');

assert.match(rules, /'replyTo'/, 'Firestore rules must explicitly allow reply metadata.');
assert.match(rules, /request\.resource\.data\.replyTo\.keys\(\)\.hasOnly/, 'Reply metadata must be constrained by Firestore rules.');
assert.match(rules, /validChatMessageParticipantUpdate/, 'Firestore rules must constrain message edits and soft deletion to the author.');
assert.match(rules, /validChatReactionCreate/, 'Firestore rules must validate reactions from chat participants.');
assert.match(rules, /match \/reacciones\/\{reactionId\}/, 'Chat reactions must use their own protected realtime collection.');
assert.match(css, /\.chat-message-reply-quote/, 'Quoted replies must have a dedicated visual treatment.');
assert.match(css, /\.chat-emoji-picker/, 'The emoji picker must have responsive styling.');
assert.match(css, /\.chat-menu-unread/, 'The mobile unread badge must have dedicated styling.');
assert.match(css, /\.chat-thread-search/, 'In-conversation search must have responsive styling.');
assert.match(css, /\.chat-message-reactions/, 'Message reactions must have a dedicated visual treatment.');

console.log('Chat experience checks passed.');
