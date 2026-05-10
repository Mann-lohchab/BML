#ifndef WSPS_UDP_READER_H
#define WSPS_UDP_READER_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define WSPS_UDP_HEX_PAYLOAD_LEN 64U
#define WSPS_UDP_BINARY_PAYLOAD_LEN 32U
#define WSPS_UDP_HEADER_TEXT "Faiveley"

typedef struct {
    bool hold_1;
    bool vent_1;
    bool hold_2;
    bool vent_2;
    bool hold_3;
    bool vent_3;
    bool hold_4;
    bool vent_4;
    bool transient_error;
    bool e_ss_sc_oc1;
    bool e_ss_sc_oc2;
    bool e_ss_sc_oc3;
    bool e_ss_sc_oc4;
    bool e_sens_fr1;
    bool e_sens_fr2;
    bool e_sens_fr3;
    bool e_sens_fr4;
    bool e_dv_sc1;
    bool e_dv_sc2;
    bool e_dv_sc3;
    bool e_dv_sc4;
    bool e_dv_oc1;
    bool e_dv_oc2;
    bool e_dv_oc3;
    bool e_dv_oc4;
    bool e_dv1_tout;
    bool e_dv2_tout;
    bool e_dv3_tout;
    bool e_dv4_tout;
    bool e_dv1_ftout;
    bool e_dv2_ftout;
    bool e_dv3_ftout;
    bool e_dv4_ftout;
    bool e_device_on;
    bool e_speed_5;
    bool e_speed_30;
    bool e_speed_45;
    bool e_zero_speed;
    bool e_wsp_failure;
    bool e_speed_5_1;
    bool e_speed_5_2;
    bool wsp_auto_test_ok;
    bool wsp_manual_test_ok;
    bool wspcu_status_ok;
    bool spare_1;
    bool spare_2;
    bool spare_3;
    bool spare_4;
} wsps_udp_flags_t;

typedef struct {
    char header[9];
    uint32_t packet_timestamp_s;
    uint64_t packet_timestamp_ms;
    uint16_t speed_axle_raw[4];
    uint16_t reference_speed_raw;
    double speed_axle_kmph[4];
    double reference_speed_kmph;
    uint8_t status_bytes[6];
    uint32_t crc;
    wsps_udp_flags_t flags;
    char source_ip[64];
    uint16_t source_port;
    char raw_hex[WSPS_UDP_HEX_PAYLOAD_LEN + 1U];
} wsps_udp_frame_t;

int wsps_udp_open_listener(const char *bind_ip, uint16_t port);
int wsps_udp_parse_payload(const char *payload_text, wsps_udp_frame_t *frame, char *error_buf, size_t error_buf_len);
int wsps_udp_receive_frame(int sockfd, wsps_udp_frame_t *frame, int timeout_ms, char *error_buf, size_t error_buf_len);
void wsps_udp_print_frame(const wsps_udp_frame_t *frame);

#endif
