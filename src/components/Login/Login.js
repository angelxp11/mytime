import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, provider } from '../server/api';
import { showToast } from '../ToastContainer';
import '../../colors.css';
import './Login.css';
import { FaEnvelope, FaLock, FaGoogle, FaEye, FaEyeSlash } from "react-icons/fa";

const Login = ({ setCurrentView }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast('Inicio de sesión exitoso', 'success');
    } catch (error) {
      showToast('Error al iniciar sesión: ' + error.message, 'error');
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      // Save to usuarios if not exists
      await setDoc(doc(db, 'usuarios', user.uid), {
        name: user.displayName,
        email: user.email,
        id: user.uid
      }, { merge: true });
      showToast('Inicio de sesión con Google exitoso', 'success');
    } catch (error) {
      showToast('Error al iniciar sesión con Google: ' + error.message, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <h2>Iniciar Sesión</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label>Correo Electrónico:</label>
          <div className="input-icon">
            <div className="icon-wrapper">
              <FaEnvelope />
            </div>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="form-group">
          <label>Contraseña:</label>
          <div className="input-icon">
            <div className="icon-wrapper">
              <FaLock />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div
              type="button"
              className="eye-wrapper"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </div>
          </div>
        </div>
        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Cargando...' : 'Iniciar Sesión'}
        </button>
        <hr className="separator" />
        <button onClick={handleGoogleLogin} className="login-button" disabled={loading}>
          <FaGoogle /> {loading ? 'Cargando...' : 'Iniciar con Google'}
        </button>
      </form>
      <div className="reset-link">
        <a href="#" onClick={() => setCurrentView('reset')}>¿Olvidaste tu contraseña?</a>
      </div>
      <div className="register-link">
        <a href="#" onClick={() => setCurrentView('register')}>¿No tienes cuenta? Regístrate</a>
      </div>
    </div>
  );
};

export default Login;