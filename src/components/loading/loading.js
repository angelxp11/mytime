import React from 'react';
import './loading.css';

const Loading = ({ text = "Cargando MyTime..." }) => {
  return (
    <div className="loading-container">
      <div className="loading-spinner">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      <h2 className="loading-text">{text}</h2>
    </div>
  );
};

export default Loading;