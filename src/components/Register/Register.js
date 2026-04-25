import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, provider } from '../server/api';
import { showToast } from '../ToastContainer';
import { FaUser, FaEnvelope, FaLock, FaGoogle, FaEye, FaEyeSlash } from "react-icons/fa";
import '../../colors.css';
import './Register.css';

const Register = ({ setCurrentView }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast('Las contraseñas no coinciden', 'error');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: name });
      await setDoc(doc(db, 'usuarios', user.uid), {
        name: name,
        email: email,
        id: user.uid
      });
      showToast('Registro exitoso', 'success');
    } catch (error) {
      showToast('Error al registrarse: ' + error.message, 'error');
    }
    setLoading(false);
  };

  const handleGoogleRegister = async () => {
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
      showToast('Registro con Google exitoso', 'success');
    } catch (error) {
      showToast('Error al registrarse con Google: ' + error.message, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="register-container">
      <h2>Registrarse</h2>
      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group">
          <label>Nombre:</label>
          <div className="input-icon">
            <div className="icon-wrapper">
              <FaUser />
            </div>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              required
            />
          </div>
        </div>
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
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
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
              type={showPassword ? "text" : "password"}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="eye-wrapper" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </div>
          </div>
        </div>
        <div className="form-group">
          <label>Confirmar Contraseña:</label>
          <div className="input-icon">
            <div className="icon-wrapper">
              <FaLock />
            </div>
            <input
              type={showConfirmPassword ? "text" : "password"}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <div className="eye-wrapper" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
            </div>
          </div>
        </div>
        <button type="submit" className="register-button" disabled={loading}>
          {loading ? 'Cargando...' : 'Registrarse'}
        </button>
        <hr className="separator" />
        <button onClick={handleGoogleRegister} className="register-button" disabled={loading}>
          <FaGoogle /> {loading ? 'Cargando...' : 'Registrarse con Google'}
        </button>
      </form>
      <div className="login-link">
        <a href="#" onClick={() => setCurrentView('login')}>¿Ya tienes cuenta? Inicia sesión</a>
      </div>
    </div>
  );
};

export default Register;