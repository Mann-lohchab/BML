#include "wsps_udp_reader.h"

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <inttypes.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#define WSPS_RECV_BUF_LEN 512

static void set_error(char *error_buf, size_t error_buf_len, const char *message) {
    if (error_buf == NULL || error_buf_len == 0U) {
        return;
    }
    snprintf(error_buf, error_buf_len, "%s", message);
}

static void set_errno_error(char *error_buf, size_t error_buf_len, const char *prefix) {
    if (error_buf == NULL || error_buf_len == 0U) {
        return;
    }
    snprintf(error_buf, error_buf_len, "%s: %s", prefix, strerror(errno));
}

static int hex_nibble(char c) {
    if (c >= '0' && c <= '9') {
        return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
        return 10 + (c - 'a');
    }
    if (c >= 'A' && c <= 'F') {
        return 10 + (c - 'A');
    }
    return -1;
}

static int normalize_hex_payload(const char *input, char *output, size_t output_len, char *error_buf, size_t error_buf_len) {
    size_t i;
    size_t out_index = 0U;

    if (output_len < (WSPS_UDP_HEX_PAYLOAD_LEN + 1U)) {
        set_error(error_buf, error_buf_len, "output buffer too small");
        return -1;
    }

    for (i = 0U; input[i] != '\0'; ++i) {
        unsigned char ch = (unsigned char) input[i];
        if (isspace(ch)) {
            continue;
        }
        if (!isxdigit(ch)) {
            set_error(error_buf, error_buf_len, "payload contains non-hex characters");
            return -1;
        }
        if (out_index >= WSPS_UDP_HEX_PAYLOAD_LEN) {
            set_error(error_buf, error_buf_len, "payload is longer than expected 64 hex characters");
            return -1;
        }
        output[out_index++] = (char) toupper(ch);
    }

    if (out_index != WSPS_UDP_HEX_PAYLOAD_LEN) {
        if (error_buf != NULL && error_buf_len > 0U) {
            snprintf(error_buf, error_buf_len, "payload length is %zu hex chars, expected %u",
                     out_index, WSPS_UDP_HEX_PAYLOAD_LEN);
        }
        return -1;
    }

    output[out_index] = '\0';
    return 0;
}

static int hex_to_bytes(const char *hex, uint8_t *bytes, size_t byte_len, char *error_buf, size_t error_buf_len) {
    size_t i;

    for (i = 0U; i < byte_len; ++i) {
        int hi = hex_nibble(hex[i * 2U]);
        int lo = hex_nibble(hex[(i * 2U) + 1U]);
        if (hi < 0 || lo < 0) {
            set_error(error_buf, error_buf_len, "invalid hex nibble");
            return -1;
        }
        bytes[i] = (uint8_t) ((hi << 4) | lo);
    }

    return 0;
}

static uint16_t read_be16(const uint8_t *p) {
    return (uint16_t) (((uint16_t) p[0] << 8) | p[1]);
}

static uint32_t read_be32(const uint8_t *p) {
    return ((uint32_t) p[0] << 24) |
           ((uint32_t) p[1] << 16) |
           ((uint32_t) p[2] << 8) |
           ((uint32_t) p[3]);
}

static bool read_status_bit(const uint8_t status[6], unsigned bit_index) {
    unsigned byte_index = bit_index / 8U;
    unsigned bit_in_byte = 7U - (bit_index % 8U);
    if (byte_index >= 6U) {
        return false;
    }
    return ((status[byte_index] >> bit_in_byte) & 0x01U) != 0U;
}

static void map_flags(const uint8_t status[6], wsps_udp_flags_t *flags) {
    memset(flags, 0, sizeof(*flags));

    flags->hold_1 = read_status_bit(status, 0U);
    flags->vent_1 = read_status_bit(status, 1U);
    flags->hold_2 = read_status_bit(status, 2U);
    flags->vent_2 = read_status_bit(status, 3U);
    flags->hold_3 = read_status_bit(status, 4U);
    flags->vent_3 = read_status_bit(status, 5U);
    flags->hold_4 = read_status_bit(status, 6U);
    flags->vent_4 = read_status_bit(status, 7U);

    flags->transient_error = read_status_bit(status, 8U);
    flags->e_ss_sc_oc1 = read_status_bit(status, 9U);
    flags->e_ss_sc_oc2 = read_status_bit(status, 10U);
    flags->e_ss_sc_oc3 = read_status_bit(status, 11U);
    flags->e_ss_sc_oc4 = read_status_bit(status, 12U);
    flags->e_sens_fr1 = read_status_bit(status, 13U);
    flags->e_sens_fr2 = read_status_bit(status, 14U);
    flags->e_sens_fr3 = read_status_bit(status, 15U);
    flags->e_sens_fr4 = read_status_bit(status, 16U);
    flags->e_dv_sc1 = read_status_bit(status, 17U);
    flags->e_dv_sc2 = read_status_bit(status, 18U);
    flags->e_dv_sc3 = read_status_bit(status, 19U);
    flags->e_dv_sc4 = read_status_bit(status, 20U);
    flags->e_dv_oc1 = read_status_bit(status, 21U);
    flags->e_dv_oc2 = read_status_bit(status, 22U);
    flags->e_dv_oc3 = read_status_bit(status, 23U);
    flags->e_dv_oc4 = read_status_bit(status, 24U);
    flags->e_dv1_tout = read_status_bit(status, 25U);
    flags->e_dv2_tout = read_status_bit(status, 26U);
    flags->e_dv3_tout = read_status_bit(status, 27U);
    flags->e_dv4_tout = read_status_bit(status, 28U);
    flags->e_dv1_ftout = read_status_bit(status, 29U);
    flags->e_dv2_ftout = read_status_bit(status, 30U);
    flags->e_dv3_ftout = read_status_bit(status, 31U);
    flags->e_dv4_ftout = read_status_bit(status, 32U);
    flags->e_device_on = read_status_bit(status, 33U);
    flags->e_speed_5 = read_status_bit(status, 34U);
    flags->e_speed_30 = read_status_bit(status, 35U);
    flags->e_speed_45 = read_status_bit(status, 36U);
    flags->e_zero_speed = read_status_bit(status, 37U);
    flags->e_wsp_failure = read_status_bit(status, 38U);
    flags->e_speed_5_1 = read_status_bit(status, 39U);
    flags->e_speed_5_2 = read_status_bit(status, 40U);
    flags->wsp_auto_test_ok = read_status_bit(status, 41U);
    flags->wsp_manual_test_ok = read_status_bit(status, 42U);
    flags->wspcu_status_ok = read_status_bit(status, 43U);
    flags->spare_1 = read_status_bit(status, 44U);
    flags->spare_2 = read_status_bit(status, 45U);
    flags->spare_3 = read_status_bit(status, 46U);
    flags->spare_4 = read_status_bit(status, 47U);
}

int wsps_udp_open_listener(const char *bind_ip, uint16_t port) {
    int sockfd;
    int enable = 1;
    struct sockaddr_in addr;

    sockfd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd < 0) {
        return -1;
    }

    if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &enable, sizeof(enable)) != 0) {
        close(sockfd);
        return -1;
    }

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);

    if (bind_ip == NULL || strcmp(bind_ip, "0.0.0.0") == 0) {
        addr.sin_addr.s_addr = htonl(INADDR_ANY);
    } else if (inet_pton(AF_INET, bind_ip, &addr.sin_addr) != 1) {
        close(sockfd);
        errno = EINVAL;
        return -1;
    }

    if (bind(sockfd, (const struct sockaddr *) &addr, sizeof(addr)) != 0) {
        close(sockfd);
        return -1;
    }

    return sockfd;
}

int wsps_udp_parse_payload(const char *payload_text, wsps_udp_frame_t *frame, char *error_buf, size_t error_buf_len) {
    uint8_t bytes[WSPS_UDP_BINARY_PAYLOAD_LEN];
    char normalized[WSPS_UDP_HEX_PAYLOAD_LEN + 1U];
    size_t i;

    if (payload_text == NULL || frame == NULL) {
        set_error(error_buf, error_buf_len, "payload_text and frame are required");
        return -1;
    }

    memset(frame, 0, sizeof(*frame));

    if (normalize_hex_payload(payload_text, normalized, sizeof(normalized), error_buf, error_buf_len) != 0) {
        return -1;
    }

    if (hex_to_bytes(normalized, bytes, sizeof(bytes), error_buf, error_buf_len) != 0) {
        return -1;
    }

    memcpy(frame->raw_hex, normalized, sizeof(normalized));
    memcpy(frame->header, bytes, 8U);
    frame->header[8] = '\0';

    if (memcmp(frame->header, WSPS_UDP_HEADER_TEXT, 8U) != 0) {
        set_error(error_buf, error_buf_len, "unexpected WSPD header");
        return -1;
    }

    frame->packet_timestamp_s = read_be32(&bytes[8]);
    frame->packet_timestamp_ms = ((uint64_t) frame->packet_timestamp_s) * 1000ULL;

    for (i = 0U; i < 4U; ++i) {
        frame->speed_axle_raw[i] = read_be16(&bytes[12U + (i * 2U)]);
        frame->speed_axle_kmph[i] = ((double) frame->speed_axle_raw[i]) / 10.0;
    }

    frame->reference_speed_raw = read_be16(&bytes[20]);
    frame->reference_speed_kmph = ((double) frame->reference_speed_raw) / 10.0;

    memcpy(frame->status_bytes, &bytes[22], sizeof(frame->status_bytes));
    frame->crc = read_be32(&bytes[28]);
    map_flags(frame->status_bytes, &frame->flags);

    return 0;
}

int wsps_udp_receive_frame(int sockfd, wsps_udp_frame_t *frame, int timeout_ms, char *error_buf, size_t error_buf_len) {
    struct pollfd pfd;
    struct sockaddr_in peer_addr;
    socklen_t peer_len = sizeof(peer_addr);
    char recv_buf[WSPS_RECV_BUF_LEN];
    ssize_t recv_len;
    int poll_result;

    if (frame == NULL) {
        set_error(error_buf, error_buf_len, "frame is required");
        return -1;
    }

    memset(&pfd, 0, sizeof(pfd));
    pfd.fd = sockfd;
    pfd.events = POLLIN;

    poll_result = poll(&pfd, 1, timeout_ms);
    if (poll_result < 0) {
        set_errno_error(error_buf, error_buf_len, "poll failed");
        return -1;
    }
    if (poll_result == 0) {
        set_error(error_buf, error_buf_len, "receive timeout");
        return 1;
    }

    recv_len = recvfrom(sockfd,
                        recv_buf,
                        sizeof(recv_buf) - 1,
                        0,
                        (struct sockaddr *) &peer_addr,
                        &peer_len);
    if (recv_len < 0) {
        set_errno_error(error_buf, error_buf_len, "recvfrom failed");
        return -1;
    }

    recv_buf[recv_len] = '\0';

    if (wsps_udp_parse_payload(recv_buf, frame, error_buf, error_buf_len) != 0) {
        return -1;
    }

    if (inet_ntop(AF_INET, &peer_addr.sin_addr, frame->source_ip, sizeof(frame->source_ip)) == NULL) {
        snprintf(frame->source_ip, sizeof(frame->source_ip), "unknown");
    }
    frame->source_port = ntohs(peer_addr.sin_port);

    return 0;
}

static void print_bool(const char *name, bool value) {
    printf("  %-18s : %s\n", name, value ? "1" : "0");
}

void wsps_udp_print_frame(const wsps_udp_frame_t *frame) {
    size_t i;

    if (frame == NULL) {
        return;
    }

    printf("source         : %s:%u\n", frame->source_ip, frame->source_port);
    printf("header         : %s\n", frame->header);
    printf("timestamp_s    : %" PRIu32 "\n", frame->packet_timestamp_s);
    printf("timestamp_ms   : %" PRIu64 "\n", frame->packet_timestamp_ms);
    for (i = 0U; i < 4U; ++i) {
        printf("speed_axle_%zu   : %.1f km/h (raw=%u)\n",
               i + 1U, frame->speed_axle_kmph[i], frame->speed_axle_raw[i]);
    }
    printf("reference_speed: %.1f km/h (raw=%u)\n",
           frame->reference_speed_kmph, frame->reference_speed_raw);
    printf("status_hex     : %02X%02X%02X%02X%02X%02X\n",
           frame->status_bytes[0],
           frame->status_bytes[1],
           frame->status_bytes[2],
           frame->status_bytes[3],
           frame->status_bytes[4],
           frame->status_bytes[5]);
    printf("crc            : %08" PRIX32 "\n", frame->crc);
    printf("flags:\n");
    print_bool("hold_1", frame->flags.hold_1);
    print_bool("vent_1", frame->flags.vent_1);
    print_bool("hold_2", frame->flags.hold_2);
    print_bool("vent_2", frame->flags.vent_2);
    print_bool("hold_3", frame->flags.hold_3);
    print_bool("vent_3", frame->flags.vent_3);
    print_bool("hold_4", frame->flags.hold_4);
    print_bool("vent_4", frame->flags.vent_4);
    print_bool("transient_error", frame->flags.transient_error);
    print_bool("e_ss_sc_oc1", frame->flags.e_ss_sc_oc1);
    print_bool("e_ss_sc_oc2", frame->flags.e_ss_sc_oc2);
    print_bool("e_ss_sc_oc3", frame->flags.e_ss_sc_oc3);
    print_bool("e_ss_sc_oc4", frame->flags.e_ss_sc_oc4);
    print_bool("e_sens_fr1", frame->flags.e_sens_fr1);
    print_bool("e_sens_fr2", frame->flags.e_sens_fr2);
    print_bool("e_sens_fr3", frame->flags.e_sens_fr3);
    print_bool("e_sens_fr4", frame->flags.e_sens_fr4);
    print_bool("e_dv_sc1", frame->flags.e_dv_sc1);
    print_bool("e_dv_sc2", frame->flags.e_dv_sc2);
    print_bool("e_dv_sc3", frame->flags.e_dv_sc3);
    print_bool("e_dv_sc4", frame->flags.e_dv_sc4);
    print_bool("e_dv_oc1", frame->flags.e_dv_oc1);
    print_bool("e_dv_oc2", frame->flags.e_dv_oc2);
    print_bool("e_dv_oc3", frame->flags.e_dv_oc3);
    print_bool("e_dv_oc4", frame->flags.e_dv_oc4);
    print_bool("e_dv1_tout", frame->flags.e_dv1_tout);
    print_bool("e_dv2_tout", frame->flags.e_dv2_tout);
    print_bool("e_dv3_tout", frame->flags.e_dv3_tout);
    print_bool("e_dv4_tout", frame->flags.e_dv4_tout);
    print_bool("e_dv1_ftout", frame->flags.e_dv1_ftout);
    print_bool("e_dv2_ftout", frame->flags.e_dv2_ftout);
    print_bool("e_dv3_ftout", frame->flags.e_dv3_ftout);
    print_bool("e_dv4_ftout", frame->flags.e_dv4_ftout);
    print_bool("e_device_on", frame->flags.e_device_on);
    print_bool("e_speed_5", frame->flags.e_speed_5);
    print_bool("e_speed_30", frame->flags.e_speed_30);
    print_bool("e_speed_45", frame->flags.e_speed_45);
    print_bool("e_zero_speed", frame->flags.e_zero_speed);
    print_bool("e_wsp_failure", frame->flags.e_wsp_failure);
    print_bool("e_speed_5_1", frame->flags.e_speed_5_1);
    print_bool("e_speed_5_2", frame->flags.e_speed_5_2);
    print_bool("wsp_auto_test_ok", frame->flags.wsp_auto_test_ok);
    print_bool("wsp_manual_test_ok", frame->flags.wsp_manual_test_ok);
    print_bool("wspcu_status_ok", frame->flags.wspcu_status_ok);
    print_bool("spare_1", frame->flags.spare_1);
    print_bool("spare_2", frame->flags.spare_2);
    print_bool("spare_3", frame->flags.spare_3);
    print_bool("spare_4", frame->flags.spare_4);
    printf("\n");
}
