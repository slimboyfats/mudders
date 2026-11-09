import { loadContent } from '@mudders/content';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { docsData } from './data';
import { Docs } from './Docs';
import './docs.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <Docs data={docsData(loadContent())} />
  </StrictMode>,
);
