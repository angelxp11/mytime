import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, provider } from '../server/api';
import { toast } from 'react-toastify';
import { FaUser, FaEnvelope, FaLock, FaGoogle } from "react-icons/fa";
import '../../colors.css';
import './Register.css';

const Register = ({ setCurrentView }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
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
      toast.success('Registro exitoso');
    } catch (error) {
      toast.error('Error al registrarse: ' + error.message);
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
      toast.success('Registro con Google exitoso');
    } catch (error) {
      toast.error('Error al registrarse con Google: ' + error.message);
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
            <FaUser />
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="form-group">
          <label>Correo Electrónico:</label>
          <div className="input-icon">
            <FaEnvelope />
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
            <FaLock />
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="form-group">
          <label>Confirmar Contraseña:</label>
          <div className="input-icon">
            <FaLock />
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="register-button" disabled={loading}>
          {loading ? 'Cargando...' : 'Registrarse'}
        </button>
      </form>
      <button onClick={handleGoogleRegister} className="register-button" disabled={loading}>
        <FaGoogle /> {loading ? 'Cargando...' : 'Registrarse con Google'}
      </button>
      <div className="login-link">
        <a href="#" onClick={() => setCurrentView('login')}>¿Ya tienes cuenta? Inicia sesión</a>
      </div>
    </div>
  );
};

export default Register;