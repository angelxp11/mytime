import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../server/api';
import { showToast } from '../ToastContainer';
import '../../colors.css';
import './ResetPassword.css';

const ResetPassword = ({ setCurrentView }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Enlace de restablecimiento enviado a tu correo', 'success');
      setCurrentView('login');
    } catch (error) {
      showToast('Error al enviar el enlace: ' + error.message, 'error');
    }
    setLoading(false);
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
        <button type="submit" className="reset-button" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar Enlace de Restablecimiento'}
        </button>
      </form>
      <div className="login-link">
        <a href="#" onClick={() => setCurrentView('login')}>Volver al inicio de sesión</a>
      </div>
      <div className="register-link">
        <a href="#" onClick={() => setCurrentView('register')}>¿No tienes cuenta? Regístrate</a>
      </div>
    </div>
  );
};

export default ResetPassword;