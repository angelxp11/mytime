import React, { useState, useEffect } from 'react';
import './ToastContainer.css';

const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    // Escuchar eventos de toast desde window
    const handleToast = (event) => {
      const { message, type = 'success' } = event.detail;
      const id = Date.now() + Math.random();

      setToasts(prev => [...prev, { id, message, type }]);

      // Auto-remover después de 3 segundos
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, 3000);
    };

    window.addEventListener('showToast', handleToast);

    return () => {
      window.removeEventListener('showToast', handleToast);
    };
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => removeToast(toast.id)}
        >
          <span>{toast.message}</span>
          <button className="toast-close" onClick={(e) => {
            e.stopPropagation();
            removeToast(toast.id);
          }}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

// Función helper para mostrar toasts desde cualquier componente
export const showToast = (message, type = 'success') => {
  window.dispatchEvent(new CustomEvent('showToast', {
    detail: { message, type }
  }));
};

export default ToastContainer;