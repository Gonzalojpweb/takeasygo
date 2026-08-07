/**
 * Apple Wallet Web Service API
 * 
 * Implementación del protocolo REST requerido por Apple para:
 * - Registro de dispositivos (POST)
 * - Obtención de pases actualizados (GET)
 * - Eliminación de registros (DELETE)
 * - Logging (POST)
 * 
 * Documentación: https://developer.apple.com/documentation/walletpasses/performing_common_operations
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/walletService'
import LoyaltyMember from '@/models/LoyaltyMember'
import crypto from 'crypto'

// Apple usa este endpoint URL en el pass.json como webServiceURL
// El device llama automáticamente a estos endpoints

/**
 * POST /api/wallet/apple/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
 * 
 * Registra un dispositivo para recibir actualizaciones push de un pase
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const pathSegments = url.pathname.split('/')
    
    // Parsear path: /api/wallet/apple/v1/devices/{deviceId}/registrations/{passType}/{serial}
    const deviceIndex = pathSegments.indexOf('devices')
    const registrationIndex = pathSegments.indexOf('registrations')
    
    if (deviceIndex === -1 || registrationIndex === -1) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const deviceLibraryIdentifier = pathSegments[deviceIndex + 1]
    const passTypeIdentifier = pathSegments[registrationIndex + 1]
    const serialNumber = pathSegments[registrationIndex + 2]

    if (!deviceLibraryIdentifier || !passTypeIdentifier || !serialNumber) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    await connectDB()

    // Buscar miembro por serialNumber (publicId)
    const member = await LoyaltyMember.findOne({
      'wallet.publicId': serialNumber
    })

    if (!member) {
      return NextResponse.json({ error: 'Pass not found' }, { status: 404 })
    }

    // Obtener pushToken del body
    const body = await request.json().catch(() => ({}))
    const pushToken = body?.pushToken

    if (!pushToken) {
      return NextResponse.json({ error: 'Missing pushToken' }, { status: 400 })
    }

    // Guardar información del dispositivo
    await LoyaltyMember.updateOne(
      { _id: member._id },
      {
        $set: {
          'wallet.appleDeviceLibraryIdentifier': deviceLibraryIdentifier,
          'wallet.pushToken': pushToken
        }
      }
    )

    return NextResponse.json({}, { status: 201 })

  } catch (error) {
    console.error('[Apple Wallet] Registration error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * GET /api/wallet/apple/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}
 * 
 * Obtiene los serial numbers de pases que han cambiado desde una fecha
 * Apple llama esto para saber qué pases necesitan actualización
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const pathSegments = url.pathname.split('/')
    
    const deviceIndex = pathSegments.indexOf('devices')
    if (deviceIndex === -1) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const deviceLibraryIdentifier = pathSegments[deviceIndex + 1]
    const passTypeIdentifier = pathSegments[deviceIndex + 3] // Después de registrations

    if (!deviceLibraryIdentifier) {
      return NextResponse.json({ error: 'Missing device ID' }, { status: 400 })
    }

    // Query params: ?passesUpdatedSince=ISO_TIMESTAMP
    const passesUpdatedSince = url.searchParams.get('passesUpdatedSince')
    const sinceDate = passesUpdatedSince ? new Date(passesUpdatedSince) : new Date(0)

    await connectDB()

    // Buscar miembros vinculados a este dispositivo que se actualizaron después de sinceDate
    const members = await LoyaltyMember.find({
      'wallet.appleDeviceLibraryIdentifier': deviceLibraryIdentifier,
      $or: [
        { 'wallet.lastSyncAt': { $gt: sinceDate } },
        { updatedAt: { $gt: sinceDate } }
      ]
    }).select('wallet.publicId wallet.lastSyncAt').lean()

    const serialNumbers = members.map(m => m.wallet.publicId)

    if (serialNumbers.length === 0) {
      return NextResponse.json({}, { status: 204 }) // No Content
    }

    return NextResponse.json({
      serialNumbers,
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Apple Wallet] GET error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * DELETE /api/wallet/apple/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}
 * 
 * Elimina el registro de un dispositivo (usuario desinstaló el pase)
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const pathSegments = url.pathname.split('/')
    
    const deviceIndex = pathSegments.indexOf('devices')
    const registrationIndex = pathSegments.indexOf('registrations')
    
    if (deviceIndex === -1 || registrationIndex === -1) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const deviceLibraryIdentifier = pathSegments[deviceIndex + 1]
    const serialNumber = pathSegments[registrationIndex + 2]

    if (!deviceLibraryIdentifier || !serialNumber) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    await connectDB()

    // Limpiar datos del dispositivo del miembro
    await LoyaltyMember.updateOne(
      {
        'wallet.publicId': serialNumber,
        'wallet.appleDeviceLibraryIdentifier': deviceLibraryIdentifier
      },
      {
        $set: {
          'wallet.appleDeviceLibraryIdentifier': null,
          'wallet.pushToken': null
        }
      }
    )

    return NextResponse.json({}, { status: 200 })

  } catch (error) {
    console.error('[Apple Wallet] DELETE error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
