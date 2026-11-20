import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMindMapTreeFromHtml } from './studyTools';
import {
  MINDMAP_MIN_ZOOM,
  MINDMAP_MAX_ZOOM,
  clampMindMapZoom,
  treeToEditableGraph,
  parseAiMindMapJson,
  addNodeToGraph,
  updateNodeInGraph,
  deleteNodeFromGraph,
  addEdgeToGraph,
  updateEdgeInGraph,
  deleteEdgeFromGraph,
  autoRelayoutEditableGraph
} from './mindMapGraph';

test('clampMindMapZoom supports extended zoom beyond 210% up to 500%', () => {
  assert.equal(MINDMAP_MIN_ZOOM, 0.25);
  assert.equal(MINDMAP_MAX_ZOOM, 5.0);
  assert.equal(clampMindMapZoom(2.5), 2.5);
  assert.equal(clampMindMapZoom(3.75), 3.75);
  assert.equal(clampMindMapZoom(5.0), 5.0);
  assert.equal(clampMindMapZoom(6.2), 5.0);
  assert.equal(clampMindMapZoom(0.1), 0.25);
});

test('treeToEditableGraph converts HTML-extracted tree into positioned editable nodes and edges', () => {
  const html = `
    <h2>Architettura Web</h2>
    <ul>
      <li>REST API: Comunicazione stateless basata su verbi HTTP.</li>
      <li>WebSocket: Canale full-duplex bidirezionale.</li>
    </ul>
    <h2>Database</h2>
    <ul>
      <li>SQL: Linguaggio dichiarativo relazionale.</li>
    </ul>
  `;
  const tree = extractMindMapTreeFromHtml(html, 'Sviluppo Backend');
  const graph = treeToEditableGraph(tree);

  assert.ok(graph.nodes.length >= 6);
  assert.equal(graph.edges.length, graph.nodes.length - 1);
  const root = graph.nodes.find(n => n.kind === 'root');
  assert.ok(root);
  assert.equal(root.label, 'Sviluppo Backend');
});

test('parseAiMindMapJson parses Gemini 3.6 Flash fenced JSON response cleanly', () => {
  const aiResponse = `\`\`\`json
  {
    "root": {
      "label": "Sistemi Cloud",
      "detail": "Panoramica container e orchestrazione",
      "children": [
        {
          "label": "Docker",
          "detail": "Containerizzazione applicazioni",
          "kind": "heading",
          "children": [
            { "label": "Dockerfile", "detail": "Ricetta immagine immutabile", "kind": "concept" },
            { "label": "Volumi", "detail": "Persistenza dei dati del container", "kind": "concept" }
          ]
        },
        {
          "label": "Kubernetes",
          "detail": "Orchestrazione cluster scalabili",
          "kind": "heading",
          "children": [
            { "label": "Pod", "detail": "Unità minima schedulabile", "kind": "concept" }
          ]
        }
      ]
    }
  }
  \`\`\``;

  const parsed = parseAiMindMapJson(aiResponse, 'Fallback');
  assert.ok(parsed);
  assert.equal(parsed.label, 'Sistemi Cloud');
  assert.equal(parsed.children.length, 2);
  assert.equal(parsed.children[0].children.length, 2);
  assert.equal(parsed.children[1].children[0].label, 'Pod');
});

test('graph editing operations move, resize, recolor, link, unlink, and delete nodes safely', () => {
  const tree = extractMindMapTreeFromHtml('<h2>Reti</h2><ul><li>TCP: Protocollo affidabile</li></ul>', 'Reti');
  let graph = treeToEditableGraph(tree);
  const initialNodes = graph.nodes.length;
  const initialEdges = graph.edges.length;
  const rootId = graph.nodes[0].id;

  // Add new custom node connected to root
  const added = addNodeToGraph(graph, rootId, { label: 'UDP', color: '#f59e0b' });
  graph = added.graph;
  assert.equal(graph.nodes.length, initialNodes + 1);
  assert.equal(graph.edges.length, initialEdges + 1);

  // Move, edit label, recolor, resize node
  graph = updateNodeInGraph(
    graph,
    added.newNodeId,
    { x: 920, y: 410, label: 'UDP Veloce', color: '#10b981', width: 260, height: 60, fontSize: 14 },
    true
  );
  const edited = graph.nodes.find(n => n.id === added.newNodeId)!;
  assert.equal(edited.x, 920);
  assert.equal(edited.y, 410);
  assert.equal(edited.label, 'UDP Veloce');
  assert.equal(edited.color, '#10b981');
  assert.equal(edited.width, 260);
  assert.equal(graph.edges.find(e => e.toId === added.newNodeId)?.color, '#10b981');

  // Create cross-link edge to another node (and reject duplicate/self-loop)
  const otherId = graph.nodes.find(n => n.id !== rootId && n.id !== added.newNodeId)!.id;
  const selfAttempt = addEdgeToGraph(graph, added.newNodeId, added.newNodeId);
  assert.equal(selfAttempt.createdEdgeId, null);

  const linkRes = addEdgeToGraph(graph, added.newNodeId, otherId, 'dashed');
  assert.ok(linkRes.createdEdgeId);
  graph = linkRes.graph;

  const dupRes = addEdgeToGraph(graph, otherId, added.newNodeId);
  assert.equal(dupRes.createdEdgeId, null);

  // Update edge style & delete edge
  graph = updateEdgeInGraph(graph, linkRes.createdEdgeId!, { style: 'solid', color: '#ec4899' });
  assert.equal(graph.edges.find(e => e.id === linkRes.createdEdgeId)?.style, 'solid');
  graph = deleteEdgeFromGraph(graph, linkRes.createdEdgeId!);
  assert.equal(graph.edges.some(e => e.id === linkRes.createdEdgeId), false);

  // Relayout preserves all nodes
  const relaid = autoRelayoutEditableGraph(graph);
  assert.equal(relaid.nodes.length, graph.nodes.length);

  // Delete node removes node and its edges
  graph = deleteNodeFromGraph(graph, added.newNodeId);
  assert.equal(graph.nodes.some(n => n.id === added.newNodeId), false);
  assert.equal(graph.edges.some(e => e.fromId === added.newNodeId || e.toId === added.newNodeId), false);
});
