import React from 'react';
import './modalconfirmation.css';

const ModalConfirmation = ({ isOpen, title, message, onConfirm, onCancel, onClose }) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <div className="modal-buttons">
          <button className="modal-button cancel" onClick={onCancel || onClose}>
            Cancelar
          </button>
          <button className="modal-button confirm" onClick={onConfirm}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalConfirmation;