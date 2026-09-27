import { Metadata } from 'next'
import OnboardingWizard from './OnboardingWizard'

export const metadata: Metadata = {
  title: 'Comenzar — Takeasygo',
  description: 'Creá tu cuenta y empezá a vender con Takeasygo',
}

export default function EmpezarPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
            <span className="text-white text-2xl font-serif italic">T</span>
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Creá tu menú digital
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Solo te tomará unos minutos
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          <OnboardingWizard />
        </div>
      </div>
    </main>
  )
}
