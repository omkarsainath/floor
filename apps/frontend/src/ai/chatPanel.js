import * as THREE from 'three';
import { createObject } from '../generators/object.js';

const API_URL = 'http://localhost:5050/api/ai-chat';

/**
 * AI Chat Panel — injects a floating chat UI into the 3D viewer
 * and processes AI actions (add/remove objects, change materials, etc.)
 */
export function createAIChatPanel(scene, layoutRef) {
  const history = [];
  let panelEl = null;
  let messagesEl = null;
  let inputEl = null;

  // ── Build DOM ──────────────────────────────────────────
  function buildUI() {
    panelEl = document.createElement('div');
    panelEl.id = 'ai-chat-panel';
    panelEl.innerHTML = `
      <style>
        #ai-chat-panel {
          position: fixed; bottom: 16px; right: 16px; width: 370px;
          font-family: 'Segoe UI', system-ui, sans-serif;
          z-index: 1000; display: flex; flex-direction: column;
        }
        #ai-chat-toggle {
          align-self: flex-end; width: 52px; height: 52px; border-radius: 50%;
          background: linear-gradient(135deg, #4285f4, #7c4dff); border: none;
          color: #fff; font-size: 24px; cursor: pointer;
          box-shadow: 0 4px 16px rgba(66,133,244,0.4);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.2s; z-index: 2;
        }
        #ai-chat-toggle:hover { transform: scale(1.1); }
        #ai-chat-body {
          display: none; background: #fff; border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          margin-bottom: 12px; overflow: hidden;
          flex-direction: column; max-height: 520px;
        }
        #ai-chat-body.open { display: flex; }
        #ai-chat-header {
          background: linear-gradient(135deg, #4285f4, #7c4dff);
          color: #fff; padding: 14px 18px; font-weight: 600; font-size: 15px;
          display: flex; justify-content: space-between; align-items: center;
        }
        #ai-chat-header button {
          background: none; border: none; color: #fff; font-size: 18px;
          cursor: pointer; padding: 0 4px;
        }
        #ai-messages {
          flex: 1; overflow-y: auto; padding: 14px; min-height: 200px;
          max-height: 340px; display: flex; flex-direction: column; gap: 10px;
        }
        .ai-msg { max-width: 88%; padding: 10px 14px; border-radius: 14px;
          font-size: 13.5px; line-height: 1.5; word-wrap: break-word; }
        .ai-msg.user { align-self: flex-end; background: #e8f0fe; color: #1a1a2e;
          border-bottom-right-radius: 4px; }
        .ai-msg.bot { align-self: flex-start; background: #f4f4f8; color: #1a1a2e;
          border-bottom-left-radius: 4px; }
        .ai-msg.bot .actions-tag { display: inline-block; background: #e3f2fd;
          color: #1565c0; font-size: 11px; padding: 2px 8px; border-radius: 10px;
          margin-top: 6px; }
        #ai-input-area {
          display: flex; border-top: 1px solid #eee; padding: 10px 12px; gap: 8px;
        }
        #ai-input {
          flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 8px 14px;
          font-size: 13.5px; outline: none; background: #fafafa;
        }
        #ai-input:focus { border-color: #4285f4; background: #fff; }
        #ai-send {
          width: 38px; height: 38px; border-radius: 50%;
          background: #4285f4; border: none; color: #fff;
          font-size: 16px; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
        }
        #ai-send:disabled { background: #bbb; cursor: default; }
        #ai-quick-actions {
          display: flex; gap: 6px; padding: 0 12px 10px; flex-wrap: wrap;
        }
        .ai-quick-btn {
          background: #f0f0f5; border: 1px solid #e0e0e0; border-radius: 16px;
          padding: 5px 12px; font-size: 12px; cursor: pointer;
          color: #444; transition: background 0.15s;
        }
        .ai-quick-btn:hover { background: #e3e8f0; }
        .ai-typing { color: #999; font-style: italic; font-size: 12px; padding: 4px 14px; }
      </style>
      <div id="ai-chat-body">
        <div id="ai-chat-header">
          <span>🤖 AI Interior Assistant</span>
          <button id="ai-close-btn" title="Close">✕</button>
        </div>
        <div id="ai-messages">
          <div class="ai-msg bot">Hi! I'm your AI interior design assistant. I can:<br>
            • <b>Detect rooms</b> from your floor plan<br>
            • <b>Auto-furnish</b> rooms with furniture<br>
            • <b>Suggest designs</b> (modern, scandinavian, etc.)<br>
            • <b>Add/move furniture</b> via chat<br>
            Try the quick actions below or type a message!</div>
        </div>
        <div id="ai-quick-actions">
          <button class="ai-quick-btn" data-cmd="detect_rooms">🏠 Detect Rooms</button>
          <button class="ai-quick-btn" data-cmd="auto_furnish">🛋️ Auto Furnish</button>
          <button class="ai-quick-btn" data-cmd="design" data-style="modern">🎨 Modern Style</button>
          <button class="ai-quick-btn" data-cmd="design" data-style="scandinavian">❄️ Scandinavian</button>
        </div>
        <div id="ai-input-area">
          <input id="ai-input" type="text" placeholder="Ask AI anything... (e.g. 'add a sofa')" />
          <button id="ai-send">➤</button>
        </div>
      </div>
      <button id="ai-chat-toggle">💬</button>
    `;
    document.body.appendChild(panelEl);

    messagesEl = panelEl.querySelector('#ai-messages');
    inputEl = panelEl.querySelector('#ai-input');
    const sendBtn = panelEl.querySelector('#ai-send');
    const toggleBtn = panelEl.querySelector('#ai-chat-toggle');
    const closeBtn = panelEl.querySelector('#ai-close-btn');
    const chatBody = panelEl.querySelector('#ai-chat-body');

    toggleBtn.addEventListener('click', () => {
      chatBody.classList.toggle('open');
      toggleBtn.style.display = chatBody.classList.contains('open') ? 'none' : 'flex';
    });
    closeBtn.addEventListener('click', () => {
      chatBody.classList.remove('open');
      toggleBtn.style.display = 'flex';
    });

    sendBtn.addEventListener('click', () => sendMessage());
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Quick action buttons
    panelEl.querySelectorAll('.ai-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        const style = btn.dataset.style;
        sendCommand(cmd, style);
      });
    });
  }

  // ── Messages ───────────────────────────────────────────
  function addMessage(text, role = 'bot', actionsCount = 0) {
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.innerHTML = text.replace(/\n/g, '<br>');
    if (actionsCount > 0 && role === 'bot') {
      div.innerHTML += `<br><span class="actions-tag">✓ ${actionsCount} scene change${actionsCount > 1 ? 's' : ''} applied</span>`;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'ai-typing';
    div.id = 'ai-typing-indicator';
    div.textContent = 'AI is thinking...';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function hideTyping() {
    const el = messagesEl.querySelector('#ai-typing-indicator');
    if (el) el.remove();
  }

  // ── API Calls ──────────────────────────────────────────
  async function sendMessage() {
    const msg = inputEl.value.trim();
    if (!msg) return;
    inputEl.value = '';
    addMessage(msg, 'user');
    history.push({ role: 'user', content: msg });

    showTyping();
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          layout: layoutRef.current,
          history: history.slice(-6),
        }),
      });
      const data = await resp.json();
      hideTyping();

      const actions = data.actions || [];
      processActions(actions, data);
      addMessage(data.message || 'Done.', 'bot', actions.length);
      history.push({ role: 'model', content: data.message || '' });
    } catch (err) {
      hideTyping();
      addMessage(`Error: ${err.message}`, 'bot');
    }
  }

  async function sendCommand(command, style) {
    const labels = {
      detect_rooms: '🏠 Detect Rooms',
      auto_furnish: '🛋️ Auto Furnish',
      design: `🎨 ${style || 'Modern'} Style`,
    };
    addMessage(labels[command] || command, 'user');
    showTyping();

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          style,
          layout: layoutRef.current,
        }),
      });
      const data = await resp.json();
      hideTyping();

      const actions = data.actions || [];
      processActions(actions, data);
      addMessage(data.message || 'Done.', 'bot', actions.length);
    } catch (err) {
      hideTyping();
      addMessage(`Error: ${err.message}`, 'bot');
    }
  }

  // ── Scene Modifications ────────────────────────────────
  function processActions(actions, fullResponse) {
    if (!actions || !actions.length) return;

    for (const action of actions) {
      switch (action.type) {
        case 'add_object':
          addObjectToScene(action);
          break;
        case 'remove_object':
          removeObjectFromScene(action);
          break;
        case 'change_floor':
          changeFloorMaterial(action);
          break;
        case 'change_wall_color':
          changeWallColor(action);
          break;
        case 'detect_rooms':
          // Room data is in fullResponse.rooms
          if (fullResponse.rooms) {
            highlightRooms(fullResponse.rooms);
          }
          break;
      }
    }
  }

  function addObjectToScene(action) {
    const w = action.width || 1;
    const d = action.depth || 1;
    const x = action.x || 0;
    const z = action.z || 0;

    const obj = {
      class: action.object_type || 'default',
      bbox: {
        x1: x - w / 2,
        y1: z - d / 2,
        x2: x + w / 2,
        y2: z + d / 2,
      },
      layoutCenter: { x: 0, y: 0 },
      walls: layoutRef.current.walls || [],
    };

    const mesh = createObject(obj);
    if (mesh) {
      mesh.userData.aiPlaced = true;
      mesh.userData.objectType = action.object_type;
      scene.add(mesh);
      console.log(`[ai] Added ${action.object_type} at (${x}, ${z})`);
    }
  }

  function removeObjectFromScene(action) {
    const type = (action.object_type || '').toLowerCase();
    const nearX = action.near_x;
    const nearZ = action.near_z;
    let removed = 0;

    scene.children.forEach(child => {
      if (child.userData.aiPlaced && child.userData.objectType === type) {
        if (nearX !== undefined && nearZ !== undefined) {
          const dist = Math.hypot(child.position.x - nearX, child.position.z - nearZ);
          if (dist > 3) return;
        }
        scene.remove(child);
        removed++;
      }
    });
    console.log(`[ai] Removed ${removed} ${type}(s)`);
  }

  function changeFloorMaterial(action) {
    const matType = (action.material || 'wood').toLowerCase();
    const colorMap = {
      wood: 0xc8956c,
      tile: 0xd5d0c8,
      marble: 0xf0ece5,
      carpet: 0x8fa87e,
    };
    const roughnessMap = { wood: 0.65, tile: 0.6, marble: 0.25, carpet: 0.95 };
    const color = colorMap[matType] || 0xc8956c;
    const roughness = roughnessMap[matType] || 0.7;

    scene.children.forEach(child => {
      if (child.isMesh && child.receiveShadow && child.position.y < 0.1 &&
          child.geometry?.type === 'ShapeGeometry') {
        child.material.color.setHex(color);
        child.material.roughness = roughness;
        child.material.needsUpdate = true;
      }
    });
    console.log(`[ai] Changed floor to ${matType}`);
  }

  function changeWallColor(action) {
    const color = action.color || '#f5f2ed';
    const hex = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;

    scene.children.forEach(child => {
      if (child.isMesh && child.castShadow && child.receiveShadow &&
          child.geometry?.type === 'BoxGeometry') {
        // Heuristic: walls are tall thin boxes
        const box = new THREE.Box3().setFromObject(child);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.y > 1.5) {
          child.material = new THREE.MeshStandardMaterial({
            color: hex, roughness: 0.55, metalness: 0.0
          });
        }
      }
    });
    console.log(`[ai] Changed wall color to ${color}`);
  }

  function highlightRooms(rooms) {
    // Add floating labels for detected rooms
    rooms.forEach(room => {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(66,133,244,0.75)';
      ctx.beginPath();
      ctx.roundRect(2, 2, 252, 60, 8);
      ctx.fill();
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(room.type || 'Room', 128, 32);

      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(3, 0.75, 1);
      sprite.position.set(room.center_x || 0, 4, room.center_z || 0);
      sprite.userData.aiPlaced = true;
      sprite.userData.objectType = 'room_label';
      scene.add(sprite);
    });
    console.log(`[ai] Highlighted ${rooms.length} rooms`);
  }

  // ── Init ───────────────────────────────────────────────
  buildUI();
  return { addMessage, sendCommand };
}
