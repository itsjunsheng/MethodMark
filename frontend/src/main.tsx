import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRoot from './AppRoot';
import { ToastProvider } from './components/Toast';
import './styles.css';
import './refinements.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ToastProvider><AppRoot /></ToastProvider></React.StrictMode>);
