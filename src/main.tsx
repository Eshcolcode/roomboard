import { createRoot } from 'react-dom/client'; import App from './App'; import './styles.css'; import { initData } from './data';
initData().then(() => createRoot(document.getElementById('root')!).render(<App />));
