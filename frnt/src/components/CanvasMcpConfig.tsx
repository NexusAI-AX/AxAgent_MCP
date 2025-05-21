import { useEffect, useState } from 'react';
import { useAppContext } from '../utils/app.context';
import { XCloseButton } from '../utils/common';

interface PingResult {
  [url: string]: string;
}

export default function CanvasMcpConfig() {
  const { setCanvasData } = useAppContext();
  const [tab, setTab] = useState(0);
  const [config, setConfig] = useState<string>('Loading...');
  const [resources, setResources] = useState<string[]>([]);
  const [newRes, setNewRes] = useState('');
  const [ping, setPing] = useState<PingResult>({});
  const [prompts, setPrompts] = useState<unknown>(null);
  const [tools, setTools] = useState<unknown>(null);

  useEffect(() => {
    fetch('/mcp_config.json')
      .then((res) => res.json())
      .then((data) => setConfig(JSON.stringify(data, null, 2)))
      .catch(() => setConfig('Failed to load configuration'));
  }, []);

  const addResource = () => {
    if (!newRes) return;
    setResources([...resources, newRes]);
    setNewRes('');
  };

  const pingResource = async (url: string) => {
    const start = Date.now();
    try {
      await fetch(url, { method: 'HEAD' });
      const ms = Date.now() - start;
      setPing((p) => ({ ...p, [url]: `OK ${ms}ms` }));
    } catch {
      setPing((p) => ({ ...p, [url]: 'Error' }));
    }
  };

  const loadPrompts = async () => {
    try {
      const data = await (await fetch('/prompts.json')).json();
      setPrompts(data);
    } catch {
      setPrompts('Failed to load prompts');
    }
  };

  const loadTools = async () => {
    try {
      const data = await (await fetch('/tools.json')).json();
      setTools(data);
    } catch {
      setTools('Failed to load tools');
    }
  };

  return (
    <div className="card bg-base-200 w-full h-full shadow-xl">
      <div className="card-body">
        <div className="flex justify-between items-center mb-4">
          <span className="text-lg font-bold">Model Context Protocol</span>
          <XCloseButton className="bg-base-100" onClick={() => setCanvasData(null)} />
        </div>
        <div role="tablist" className="tabs tabs-boxed mb-2">
          <a className={`tab ${tab === 0 ? 'tab-active' : ''}`} onClick={() => setTab(0)}>Config</a>
          <a className={`tab ${tab === 1 ? 'tab-active' : ''}`} onClick={() => setTab(1)}>Resources</a>
          <a className={`tab ${tab === 2 ? 'tab-active' : ''}`} onClick={() => setTab(2)}>Prompts</a>
          <a className={`tab ${tab === 3 ? 'tab-active' : ''}`} onClick={() => setTab(3)}>Tools</a>
        </div>
        {tab === 0 && <pre className="overflow-auto text-sm h-full">{config}</pre>}
        {tab === 1 && (
          <div className="flex flex-col gap-2">
            <div className="flex">
              <input
                className="input input-bordered grow mr-2"
                value={newRes}
                onChange={(e) => setNewRes(e.target.value)}
                placeholder="Resource URL"
              />
              <button className="btn btn-sm" onClick={addResource}>
                Add
              </button>
            </div>
            <ul className="menu">
              {resources.map((r) => (
                <li key={r} className="flex flex-row items-center">
                  <span className="grow truncate">{r}</span>
                  <button className="btn btn-xs" onClick={() => pingResource(r)}>
                    Ping
                  </button>
                  <span className="ml-2 text-xs">{ping[r]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 2 && (
          <div className="flex flex-col h-full overflow-auto">
            <button className="btn btn-sm mb-2" onClick={loadPrompts}>
              Load Prompts
            </button>
            <pre className="text-sm overflow-auto grow">
              {prompts ? JSON.stringify(prompts, null, 2) : ''}
            </pre>
          </div>
        )}
        {tab === 3 && (
          <div className="flex flex-col h-full overflow-auto">
            <button className="btn btn-sm mb-2" onClick={loadTools}>
              Load Tools
            </button>
            <pre className="text-sm overflow-auto grow">
              {tools ? JSON.stringify(tools, null, 2) : ''}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
