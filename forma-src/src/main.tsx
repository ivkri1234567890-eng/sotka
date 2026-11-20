import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import { isNative } from './platform/files';

createRoot(document.getElementById('root')!).render(<App />);
// Service Worker — только в веб-версии и только в пределах папки приложения
if (!isNative() && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
