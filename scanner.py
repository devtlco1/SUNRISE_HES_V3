import serial
import time
from gurux_dlms import GXDLMSClient
from gurux_dlms.enums import InterfaceType, Authentication

def scan_meter():
    port_path = "/dev/tty.usbserial-0001"
    
    client = GXDLMSClient()
    client.interfaceType = InterfaceType.HDLC
    client.useLogicalNameReferencing = True
    client.clientAddress = 1 
    client.serverAddress = 1 # سنستخدم الـ Broadcast أولاً كما في الـ JSON
    
    client.authentication = Authentication.LOW
    client.password = b"88935860"

    try:
        print(f"--- SUNRISE_HES_V3: Optical Sync (300 -> 9600) ---")
        
        # البدء بالسرعة القياسية للعين الضوئية (300)
        ser = serial.Serial(
            port=port_path, 
            baudrate=300, 
            bytesize=serial.SEVENBITS,
            parity=serial.PARITY_EVEN, 
            stopbits=1, 
            timeout=5
        )

        # 1. Wake up (إرسال الأصفار ببطء لتنشيط الحساس)
        print("Step 1: Sending 40 Wake-up bytes...")
        for _ in range(40):
            ser.write(b'\x00')
            time.sleep(0.01)
        time.sleep(0.2) 

        # 2. IEC Handshake
        print("Step 2: Sending Handshake (/?!)...")
        ser.reset_input_buffer()
        ser.write(b"/?!\r\n")
        
        # انتظار الاستجابة (Identity)
        time.sleep(1.5)
        identity = ser.readline().decode().strip()
        
        if not identity:
            print("Meter Identity is EMPTY. Check probe alignment or battery.")
            # محاولة أخيرة بزيادة وقت الانتظار
            identity = ser.read(ser.in_waiting).decode().strip()
            
        print(f"Meter Identity: {identity}")

        # 3. Switching to 9600 (DLMS Mode)
        print("Step 3: Switching to 9600 Baud...")
        # استخدام الـ ACK من الـ JSON: 063235320D0A
        ser.write(bytes.fromhex("063235320D0A"))
        time.sleep(1.2) 
        
        # التغيير لـ 9600 و 8N1 كما في الـ JSON
        ser.baudrate = 9600
        ser.bytesize = serial.EIGHTBITS
        ser.parity = serial.PARITY_NONE
        
        # 4. Broadcast SNRM (مهم جداً لفتح القناة في موديلات 2024)
        print("Step 4: Sending Broadcast SNRM...")
        broadcast_snrm = bytes.fromhex("7EA00AFEFEFEFF0393C9837E")
        ser.write(broadcast_snrm)
        time.sleep(1)
        ser.read(ser.in_waiting) # تنظيف

        # 5. Specific SNRM
        print("Step 5: Sending Client SNRM...")
        snrm_req = client.snrmRequest()
        ser.write(bytes(snrm_req))
        time.sleep(1.5)
        
        reply = ser.read(ser.in_waiting or 1024)
        if reply:
            print(f"UA Received: {reply.hex().upper()}")
            client.parseUAResponse(list(reply))
            
            # 6. Login (AARQ)
            print("Step 6: Sending AARQ with Password...")
            aarq_req = client.aarqRequest()
            ser.write(bytes(aarq_req))
            time.sleep(1.5)
            aare = ser.read(ser.in_waiting or 1024)
            if aare:
                client.parseAareResponse(list(aare))
                print("--- ASSOCIATION SUCCESSFUL ---")
                
                # قراءة رقم العداد (0.0.96.1.1.255)
                print("Reading OBIS: 0.0.96.1.1.255...")
        else:
            print("No UA response. Meter might be locked or needs specific Server ID.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        ser.close()
        print("Connection Closed.")

if __name__ == "__main__":
    scan_meter()