import React, { useState } from 'react';
import '../../colors.css';
import './ResetPassword.css';

const ResetPassword = () => {
  const [email, setEmail] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle reset password logic here
    console.log('Reset Password for:', email);
  };

  return (
    <div className="reset-container">
      <h2>Restablecer Contraseña</h2>
      <form onSubmit={handleSubmit} className="reset-form">
        <div className="form-group">
          <label htmlFor="email">Correo Electrónico:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="reset-button">
          Enviar Enlace de Restablecimiento
        </button>
      </form>
    </div>
  );
};

export default ResetPassword;